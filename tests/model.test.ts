// The spend guard wired into the one adapter. A fake client stands in for the API, so no money is spent.
import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { ModelAdapter, type MessagesClient } from "../lib/model.ts";
import { SpendStop, SpendTracker } from "../lib/spend.ts";

const prices = { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.5 };
const Schema = z.object({ answer: z.string() });

function reply(text: string, input = 1000, output = 200, stop = "end_turn") {
  return { content: [{ type: "text", text }], stop_reason: stop, usage: { input_tokens: input, output_tokens: output } };
}

function fakeClient(script: Array<() => unknown>): MessagesClient & { bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = [];
  let i = 0;
  return {
    bodies,
    messages: {
      create: async (body: never) => {
        bodies.push(body as Record<string, unknown>);
        const step = script[Math.min(i++, script.length - 1)];
        return step();
      },
    },
  };
}

test("sends no temperature, turns thinking off and asks for structured output", async () => {
  const client = fakeClient([() => reply('{"answer":"ok"}')]);
  const a = new ModelAdapter(client, "test-model", new SpendTracker(prices, 4, 0, 3));
  const r = await a.call({ system: "s", user: "u", schema: Schema, maxOutputTokens: 100 });
  const body = client.bodies[0];
  assert.equal("temperature" in body, false);
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal((body.output_config as { format: { type: string } }).format.type, "json_schema");
  assert.deepEqual(r.parsed, { answer: "ok" });
});

test("sends the thinking setting the config names for the model", async () => {
  const client = fakeClient([() => reply('{"answer":"ok"}')]);
  const a = new ModelAdapter(client, "test-model", new SpendTracker(prices, 4, 0, 3), undefined, { type: "between_tools" });
  await a.call({ system: "s", user: "u", schema: Schema, maxOutputTokens: 100 });
  assert.deepEqual(client.bodies[0].thinking, { type: "between_tools" });
  assert.equal("temperature" in client.bodies[0], false);
});

test("the reported token counts set the cost, and a reply that does not parse still counts", async () => {
  const spend = new SpendTracker(prices, 4, 0, 3);
  const client = fakeClient([() => reply("not json", 2_000_000, 0)]);
  const a = new ModelAdapter(client, "m", spend);
  const r = await a.call({ system: "s", user: "u", schema: Schema, maxOutputTokens: 100 });
  assert.equal(r.parsed, null);
  assert.ok(Math.abs(spend.runUsd - 0.2) < 1e-9);
  assert.equal(spend.reservedUsd, 0);
});

test("a rate limit retry reserves again through the guard and the run carries on", async () => {
  const spend = new SpendTracker(prices, 4, 0, 3);
  let reserves = 0;
  const original = spend.reserve.bind(spend);
  spend.reserve = (i, o) => { reserves++; return original(i, o); };
  const limited = () => { throw new Anthropic.RateLimitError(429, {}, "rate limited", new Headers({ "retry-after": "0" })); };
  const client = fakeClient([limited, () => reply('{"answer":"after wait"}')]);
  const a = new ModelAdapter(client, "m", spend);
  const r = await a.call({ system: "s", user: "u", schema: Schema, maxOutputTokens: 100 });
  assert.equal(r.parsed?.answer, "after wait");
  assert.equal(r.attempts, 2);
  assert.equal(reserves, 2);
});

test("a call that could pass the kill switch is never sent", async () => {
  const spend = new SpendTracker(prices, 0.0001, 0, 3);
  const client = fakeClient([() => reply('{"answer":"x"}')]);
  const a = new ModelAdapter(client, "m", spend);
  await assert.rejects(a.call({ system: "s".repeat(5000), user: "u", schema: Schema, maxOutputTokens: 1000 }), SpendStop);
  assert.equal(client.bodies.length, 0);
});

test("two requests at the same time cannot both spend the same remaining budget", async () => {
  // Each call may cost at most 1.25 x (1000 x 0.1 + 1000 x 0.5) / 1e6 = 0.00075 USD. The kill switch fits one.
  const spend = new SpendTracker(prices, 0.001, 0, 3);
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  const client = fakeClient([async () => { await gate; return reply('{"answer":"one"}', 10, 10); }]);
  const a = new ModelAdapter(client, "m", spend);
  const first = a.call({ system: "x".repeat(999), user: "u", schema: Schema, maxOutputTokens: 1000 });
  const second = a.call({ system: "x".repeat(999), user: "u", schema: Schema, maxOutputTokens: 1000 });
  await assert.rejects(second, SpendStop);
  release();
  assert.equal((await first).parsed?.answer, "one");
  assert.equal(client.bodies.length, 1);
});

test("the run stops to ask before the running total across runs passes the ask amount", async () => {
  const spend = new SpendTracker(prices, 4, 2.9999, 3);
  const client = fakeClient([() => reply('{"answer":"x"}')]);
  const a = new ModelAdapter(client, "m", spend);
  await assert.rejects(a.call({ system: "s".repeat(4000), user: "u", schema: Schema, maxOutputTokens: 1000 }),
    (e: unknown) => e instanceof SpendStop && e.reason === "ASK_NAJABAT");
  assert.equal(client.bodies.length, 0);
});
