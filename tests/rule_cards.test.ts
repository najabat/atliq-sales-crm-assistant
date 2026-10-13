// The screen helpers added in the slice 4 review. Invented companies, people, dates and quotes only.
import assert from "node:assert/strict";
import test from "node:test";
import { cellValue, modelName, versionName } from "../lib/format.ts";
import { stableId } from "../lib/pipeline.ts";
import { cardId, customerLastLine, ruleReplies } from "../lib/rule_replies.ts";
import { setByRule } from "../lib/shown.ts";
import { changeCounts, changeView, countLine, standingCount } from "../lib/state.ts";
import type { Decision } from "../lib/store.ts";
import type { CrmChange, Item, WaitingCustomer } from "../lib/types.ts";

const THREAD = [
  "# Email Thread: Zentrova Pets",
  "**From:** Mira Okafor <mira@zentrovapets.example>",
  "**To:** Jay <jay@atliq.com>",
  "**Date:** 2031-03-02",
  "**Subject:** Dashboards",
  "",
  "Hi Jay,",
  "",
  "Could you send the pricing sheet for the pet store dashboards by Friday?",
  "We want to show it to the board next week.",
  "",
  "Mira Okafor",
  "Head of Operations, Zentrova Pets",
].join("\n");

const waiting: WaitingCustomer = { account: "Zentrova Pets", lead_id: "L-9001", file: "emails/zentrova.md", last_customer_message_date: "2031-03-02", days_waiting: 9 };
const crm = [{ lead_id: "L-9001", owner: "Jay" }] as never;

test("customerLastLine takes the last sentence, never a greeting, a name or a signature", () => {
  const line = customerLastLine({ index: 0, from: null, to: [], cc: [], date: null, subject: null,
    body: "Hi Jay,\n\nCould you send the pricing sheet?\nWe want to show it to the board next week.\n\nMira Okafor\nHead of Operations, Zentrova Pets" });
  assert.equal(line, "We want to show it to the board next week.");
});

test("a waiting customer with no Reply owed item gets one rule-made card, quoted word for word", () => {
  const cards = ruleReplies([waiting], [], () => THREAD, crm, "atliq.com");
  assert.equal(cards.length, 1);
  const c = cards[0];
  assert.equal(c.type, "reply_owed");
  assert.equal(c.summary, "Reply to their last message");
  assert.equal(c.quote, "We want to show it to the board next week.");
  assert.ok(THREAD.includes(c.quote));
  assert.equal(c.owner, "Jay");
  assert.equal(c.owner_from, "crm");
  assert.equal(c.days_waiting, 9);
  assert.equal(c.rule_made, true);
  assert.ok(setByRule(c));
  // The id is stable, so a seller's close survives a rebuild.
  assert.equal(ruleReplies([waiting], [], () => THREAD, crm, "atliq.com")[0].id, c.id);
});

test("no rule-made card when a Reply owed item already exists, or when no quote can be found", () => {
  const existing = { id: "x", file: waiting.file, type: "reply_owed", account: waiting.account, lead_id: waiting.lead_id } as Item;
  assert.equal(ruleReplies([waiting], [existing], () => THREAD, crm, "atliq.com").length, 0);
  assert.equal(ruleReplies([waiting], [], () => "**From:** Mira <mira@zentrovapets.example>\n**Date:** 2031-03-02\n\nok", crm, "atliq.com").length, 0);
  assert.equal(ruleReplies([{ ...waiting, lead_id: null }], [], () => THREAD, crm, "atliq.com")[0].owner, "no owner");
});

test("the card id is built exactly as the pipeline builds item ids", () => {
  assert.equal(cardId("emails/a.md", "reply_owed", "some quote"), stableId("emails/a.md", "reply_owed", "some quote"));
});

test("nudges are rule-made, model items are not", () => {
  assert.ok(setByRule({ type: "nudge_due" } as Item));
  assert.ok(!setByRule({ type: "promise" } as Item));
});

test("both screens count changes, accounts and flag-only accounts the same way", () => {
  const ch = (id: string, lead: string | null, company: string): CrmChange =>
    ({ id, lead_id: lead, company, field: "notes", current: null, proposed: "x", quote: "q", file: null, set_by: "model", status: "proposed" });
  const changes = [ch("1", "L-1", "Alder"), ch("2", "L-1", "Alder"), ch("3", null, "Birchwood")];
  const flags = [
    { kind: "no_owner", lead_ids: ["L-1"], company: null },
    { kind: "no_owner", lead_ids: ["L-7"], company: null },
    { kind: "double_entry", lead_ids: ["L-8", "L-9"], company: null },
  ];
  const approved: Decision[] = [{ target: "3", action: "approve", by: "Jay", at: "2031-01-01T00:00:00Z", reason: null, old_value: null, new_value: null }];
  const c = changeCounts(changes.map((x) => changeView(x, approved)), flags);
  assert.equal(c.pending, 2);
  assert.equal(c.pendingBy.size, 1);
  assert.equal(c.flagOnly, 1);
  assert.equal(countLine(c), "2 changes wait for a decision on 1 account, plus 1 account with flags only.");
});

test("standing decisions are counted apart from the log, undos included", () => {
  const log: Decision[] = [
    { target: "a", action: "approve", by: "Jay", at: "1", reason: null, old_value: null, new_value: null },
    { target: "a", action: "undo", by: "Jay", at: "2", reason: null, old_value: null, new_value: null },
    { target: "b", action: "reject", by: "Jay", at: "3", reason: null, old_value: null, new_value: null },
  ];
  assert.equal(standingCount(log), 1);
});

test("display names and CRM cells", () => {
  assert.equal(modelName("claude-haiku-5-5"), "Claude Haiku 5.5");
  assert.equal(modelName("some-other-model"), "some-other-model");
  assert.equal(versionName("unknown"), "unknown");
  assert.equal(cellValue("est_value_usd", "45000"), "$45k");
  assert.equal(cellValue("created_date", "2031-02-20"), "20 Feb 2031");
  assert.equal(cellValue("owner", ""), "not stated");
});
