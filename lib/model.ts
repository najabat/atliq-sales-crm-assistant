// The one model adapter. Laptop only: the batch run uses it, no route on the site does.
// The model name and prices come from config, so a model swap is a config change.
// Settings from Anthropic's docs: no temperature, thinking off, structured output through
// output_config.format. Each model names its own thinking-off setting in config: Claude Haiku 5.5
// takes "disabled", Claude Sonnet 5.5 rejects that and takes "between_tools".
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { SpendStop, type SpendTracker } from "./spend.ts";

export interface CallResult<T> {
  parsed: T | null; // null when the output did not parse, was cut off or was a refusal
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  raw: string; // the text the model returned, for the run log on the laptop
  attempts: number; // includes waits after a rate limit
}

export interface ThinkingSetting { type: "disabled" | "between_tools" }

export interface CallOptions<S extends z.ZodType> {
  system: string;
  user: string;
  schema: S;
  maxOutputTokens: number;
}

// The parts of the client the adapter uses. Tests pass a fake with the same shape.
export interface MessagesClient {
  messages: { create: (body: never) => Promise<unknown> };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function makeClient(): MessagesClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set. Run with --env-file=.env.local on the laptop.");
  // maxRetries 0: every retry goes back through the spend guard below instead of the client's own loop.
  return new Anthropic({ apiKey, maxRetries: 0, timeout: 120_000 }) as unknown as MessagesClient;
}

export class ModelAdapter {
  private client: MessagesClient;
  private model: string;
  private spend: SpendTracker;
  private maxRateLimitWaits: number;
  private thinking: ThinkingSetting;

  constructor(client: MessagesClient, model: string, spend: SpendTracker, maxRateLimitWaits = 8,
    thinking: ThinkingSetting = { type: "disabled" }) {
    this.client = client;
    this.model = model;
    this.spend = spend;
    this.maxRateLimitWaits = maxRateLimitWaits;
    this.thinking = thinking;
  }

  get modelName(): string { return this.model; }

  async call<S extends z.ZodType>(opts: CallOptions<S>): Promise<CallResult<z.infer<S>>> {
    // An upper bound on the prompt: no token is shorter than one character.
    const maxInputTokens = opts.system.length + opts.user.length;
    // create() rather than parse(): the reply is parsed here, so its token counts are kept even when it does not parse.
    const format = zodOutputFormat(opts.schema);
    let attempts = 0;
    for (;;) {
      attempts++;
      const res = this.spend.reserve(maxInputTokens, opts.maxOutputTokens);
      try {
        const msg = (await this.client.messages.create({
          model: this.model,
          max_tokens: opts.maxOutputTokens,
          thinking: this.thinking,
          system: opts.system,
          messages: [{ role: "user", content: opts.user }],
          output_config: { format: { type: format.type, schema: format.schema } },
        } as never)) as Anthropic.Message;
        const inputTokens = msg.usage?.input_tokens ?? 0;
        const outputTokens = msg.usage?.output_tokens ?? 0;
        const costUsd = this.spend.settle(res, inputTokens, outputTokens);
        const raw = msg.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("");
        let parsed: z.infer<S> | null = null;
        if (msg.stop_reason !== "refusal" && msg.stop_reason !== "max_tokens") {
          try { parsed = format.parse(raw) as z.infer<S>; } catch { parsed = null; }
        }
        return { parsed, stopReason: msg.stop_reason, inputTokens, outputTokens, costUsd, raw, attempts };
      } catch (err) {
        if (err instanceof SpendStop) throw err;
        // A rate limit answer: wait as long as it says and carry on. Never fail a run because of one.
        if (err instanceof Anthropic.RateLimitError && attempts <= this.maxRateLimitWaits) {
          this.spend.settle(res);
          const after = Number(err.headers?.get?.("retry-after") ?? "") || 20;
          console.log(`  rate limited, waiting ${after} s`);
          await sleep(after * 1000);
          continue;
        }
        this.spend.settle(res);
        throw err;
      }
    }
  }
}
