// Checks a results file. Prints counts only, never document text.
//   node scripts/check_results.ts data/results/<model>/results.json
// 1. The shape follows docs/OUTPUT_SCHEMA.md.
// 2. Every item's quote is found word for word in its file, using the eval's own quoteFound, not the app's code.
// 3. Every model call of the run is in the run log with its token counts.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const file = process.argv[2];
if (!file) { console.error("Give the results file."); process.exit(1); }
const root = process.cwd();
const { quoteFound } = await import(new URL(`file:///${path.join(root, "eval", "lib.mjs").replace(/\\/g, "/")}`).href);

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cand = z.array(z.string()).optional();
const Schema = z.object({
  run: z.object({ run_id: z.string(), prompt_version: z.string(), model: z.string(), reference_date: date, documents: z.number(),
    input_tokens: z.number(), output_tokens: z.number(), cost_usd: z.number(), duration_seconds: z.number() }),
  documents: z.array(z.object({ file: z.string(), accounts: z.array(z.string()), internal: z.boolean(),
    last_external_message_from: z.enum(["customer", "atliq"]).nullable(), last_external_message_date: date.nullable(),
    customer_last_message_asks: z.boolean().nullable(), atliq_last_message_expects_answer: z.boolean().nullable(),
    atliq_last_message_carries_proposal: z.boolean().nullable(), needs_review: z.boolean(), instruction_flagged: z.boolean(),
    status: z.enum(["ok", "needs review", "failed"]) })),
  items: z.array(z.object({ id: z.string(), file: z.string(),
    type: z.enum(["reply_owed", "promise", "deadline", "come_back", "new_need", "nudge_due"]), account: z.string(),
    lead_id: z.string().nullable(), summary: z.string(), quote: z.string(), message_date: date, owner: z.string(),
    owner_from: z.enum(["source", "crm"]).nullable(), due_date: date.nullable(), due_text: z.string().nullable(), due_approx: z.boolean(),
    days_waiting: z.number().nullable(), needs_review: z.boolean(), status: z.string(), candidate_lead_ids: cand })),
  waiting_customers: z.array(z.object({ account: z.string(), lead_id: z.string().nullable(), file: z.string(),
    last_customer_message_date: date, days_waiting: z.number(), candidate_lead_ids: cand })),
  gone_quiet: z.array(z.object({ account: z.string(), lead_id: z.string().nullable(), file: z.string(), last_atliq_message_date: date,
    days_since: z.number(), quote: z.string(), candidate_lead_ids: cand })),
  crm_changes: z.array(z.object({ id: z.string(), lead_id: z.string().nullable(), company: z.string(), field: z.string(),
    current: z.string().nullable(), proposed: z.unknown(), quote: z.string().nullable(), file: z.string().nullable(),
    set_by: z.enum(["rule", "model"]), status: z.string(), candidate_lead_ids: cand })),
  crm_flags: z.array(z.object({ kind: z.enum(["double_entry", "no_owner", "conflict", "missing_company", "overdue"]),
    lead_ids: z.array(z.string()), company: z.string().nullable(), file: z.string().nullable(), quote: z.string().nullable(), note: z.string() })),
  dropped: z.array(z.object({ file: z.string(), kind: z.enum(["item", "crm_change"]), quote: z.string(), reason: z.string() })),
});

const results = JSON.parse(fs.readFileSync(file, "utf8"));
const shape = Schema.safeParse(results);
console.log(`1. Shape: ${shape.success ? "valid" : "INVALID"}`);
if (!shape.success) { for (const i of shape.error.issues.slice(0, 5)) console.log(`   ${i.path.join(".")}: ${i.message}`); process.exitCode = 1; }

const items = results.items as { quote: string; file: string; type: string }[];
const bad = items.filter((i) => !quoteFound(i.quote, i.file));
const quiet = (results.gone_quiet as { quote: string; file: string }[]).filter((g) => !quoteFound(g.quote, g.file));
console.log(`2. Quotes found word for word: ${items.length - bad.length} of ${items.length} items, ${results.gone_quiet.length - quiet.length} of ${results.gone_quiet.length} gone quiet lines`);
if (bad.length || quiet.length) process.exitCode = 1;

const log = path.join(path.dirname(file), "run_log.jsonl");
const lines = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const calls = lines.filter((l) => l.run_id === results.run.run_id && (l.call === 1 || l.call === 2)); // both model calls
const withTokens = calls.filter((l) => Number.isInteger(l.input_tokens) && Number.isInteger(l.output_tokens) && l.input_tokens > 0);
const sumIn = calls.reduce((s, l) => s + l.input_tokens, 0), sumOut = calls.reduce((s, l) => s + l.output_tokens, 0);
console.log(`3. Run log: ${calls.length} model call(s) for run ${results.run.run_id}, ${withTokens.length} with token counts. ` +
  `Logged ${sumIn} in and ${sumOut} out, results file says ${results.run.input_tokens} in and ${results.run.output_tokens} out.`);
if (withTokens.length !== calls.length || sumIn !== results.run.input_tokens || sumOut !== results.run.output_tokens) process.exitCode = 1;
console.log(process.exitCode ? "CHECK FAILED" : "All checks passed.");
