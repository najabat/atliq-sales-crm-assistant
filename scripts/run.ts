// The batch run. Runs on Najabat's laptop only, never on Vercel.
//   node scripts/run.ts --rules-only                                       rules alone, no model
//   node --env-file=.env.local scripts/run.ts --model --sample five        first five of the tuning sample
//   node --env-file=.env.local scripts/run.ts --model --sample tune        every fifth file in name order
//   node --env-file=.env.local scripts/run.ts --model --sample all         all 50 documents, writes results.json
//   node --env-file=.env.local scripts/run.ts --model --sample all --fresh  a second run that calls again, results_run2.json
//   node --env-file=.env.local scripts/run.ts --model --tests              the five hidden instruction test emails
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../lib/config.ts";
import { buildCrmChanges, call2User, closedItems, CRM_RULES_VERSION, docsForRow, nextStepChanges } from "../lib/crm_changes.ts";
import { readCrmFile } from "../lib/crm.ts";
import { buildItems, checkQuotes, followUps, mergeSamePassage, openReplies, RULES_VERSION, type BuildContext } from "../lib/extract.ts";
import { makeClient, ModelAdapter, type ThinkingSetting } from "../lib/model.ts";
import { listDataset, prepareDocument, ruleChanges, ruleFlags, waitingCustomers, type PreparedDoc } from "../lib/pipeline.ts";
import { CALL1_EXAMPLES, CALL1_VERSION, call1Instructions, Call1Output, call1System, call1User, type Call1Result } from "../lib/prompts/call1.ts";
import { CALL2_VERSION, call2Instructions, Call2Output, type Call2Result } from "../lib/prompts/call2.ts";
import { orderItems, type Team } from "../lib/rules.ts";
import { SpendStop, SpendTracker } from "../lib/spend.ts";
import type { CrmChange, CrmFlag, Dropped, GoneQuiet, Item, Results } from "../lib/types.ts";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };

const started = Date.now();
const cfg = loadConfig(ROOT);
const dataset = path.join(ROOT, cfg.data.dataset_folder);
const testsDir = path.join(ROOT, cfg.data.test_emails_folder);
const team: Team = { names: [...cfg.team.sellers, ...cfg.team.pre_sales], domain: cfg.team.email_domain };
const crm = readCrmFile(dataset);
const ref = cfg.data.dataset_reference_date;
const allFiles = listDataset(dataset);
const testMode = args.includes("--tests");
const readSource = (file: string) => fs.readFileSync(testMode ? path.join(testsDir, file) : path.join(dataset, file), "utf8");
const prepare = (file: string) => prepareDocument(file, readSource(file), crm, team);

function writeResults(dir: string, name: string, results: Results, copyToCurrent: boolean) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(results, null, 2));
  if (copyToCurrent) fs.copyFileSync(path.join(dir, name), path.join(ROOT, "data", "results", "current.json"));
}

// ------------------------------------------------------------------ rules only
if (args.includes("--rules-only")) {
  const docs = allFiles.map(prepare);
  const results: Results = {
    run: { run_id: `${new Date().toISOString().replace(/[:.]/g, "-")}_rules-only`, prompt_version: "rules-only", model: "none, rules only",
      reference_date: ref, documents: docs.length, input_tokens: 0, output_tokens: 0, cost_usd: 0, duration_seconds: 0 },
    documents: docs.map((d) => d.result),
    items: [],
    waiting_customers: waitingCustomers(docs, crm, ref),
    gone_quiet: [],
    crm_changes: ruleChanges(docs, crm),
    crm_flags: ruleFlags(docs, crm),
    dropped: [],
  };
  results.run.duration_seconds = Math.round((Date.now() - started) / 1000);
  writeResults(path.join(ROOT, "data", "results", "rules-only"), "results.json", results, true);
  console.log(`Rules-only run. ${docs.length} documents. Wrote data/results/rules-only/results.json and current.json`);
  process.exit(0);
}

if (!args.includes("--model")) {
  console.error("Use --rules-only, or --model with --sample five|tune|all or --tests.");
  process.exit(1);
}

// ------------------------------------------------------------------ model run setup
const mcfg = cfg.model as Record<string, unknown>;
const model = mcfg.working_model as string;
const candidate = (mcfg.candidates as Record<string, { usd_per_million_input_tokens: number; usd_per_million_output_tokens: number; thinking?: ThinkingSetting }>)[model];
if (!candidate?.thinking) { console.error(`Config names no thinking setting for ${model}. The run stops before any paid call.`); process.exit(1); }
const c1 = cfg.call_1_extract_items as { system_prompt_budget_tokens: number; example_budget_tokens_each: number; examples_in_prompt: number; max_output_tokens: number };
const c2 = cfg.call_2_refresh_account as { prompt_budget_tokens: number; max_documents_per_account: number; max_output_tokens: number };
const cost = cfg.cost_control as { kill_switch_per_run_usd: number };
const askAt = mcfg.paid_spend_ask_at_usd as number;
const fresh = args.includes("--fresh");
const outDir = path.join(ROOT, "data", "results", model);
// A consistency run must call again, so it keeps its own store and never reads the first run's answers.
const cacheDir = path.join(outDir, testMode ? "cache_tests" : fresh ? "cache_run2" : "cache");
const logFile = path.join(outDir, "run_log.jsonl");
fs.mkdirSync(cacheDir, { recursive: true });

const tuneSample = allFiles.filter((_, i) => i % 5 === 4); // every fifth file in name order, chosen without labels
const sample = testMode ? "tests" : arg("--sample") ?? "five";
const files = testMode ? fs.readdirSync(testsDir).filter((f) => f.endsWith(".md")).sort()
  : sample === "all" ? allFiles : sample === "tune" ? tuneSample : sample === "five" ? tuneSample.slice(0, 5) : null;
if (!files) { console.error("--sample must be five, tune or all"); process.exit(1); }

function priorSpend(): number {
  let total = 0;
  const dir = path.join(ROOT, "data", "results");
  for (const m of fs.readdirSync(dir)) {
    const f = path.join(dir, m, "run_log.jsonl");
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) if (line.trim()) total += JSON.parse(line).cost_usd ?? 0;
  }
  return total;
}

const prior = priorSpend();
const spend = new SpendTracker(
  { inputUsdPerMillion: candidate.usd_per_million_input_tokens, outputUsdPerMillion: candidate.usd_per_million_output_tokens },
  cost.kill_switch_per_run_usd, prior, askAt,
);
const adapter = new ModelAdapter(makeClient(), model, spend, undefined, candidate.thinking);
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}_${model}${fresh ? "_run2" : ""}${testMode ? "_tests" : ""}`;
const version = `${CALL1_VERSION}-${RULES_VERSION}+${CALL2_VERSION}-${CRM_RULES_VERSION}`;
const sources = [...new Set(crm.map((r) => r.source).filter(Boolean))].sort();
const services = [...new Set(crm.map((r) => r.service_interest).filter(Boolean))].sort(); // the CRM's own service lines
const system1 = call1System(team.names, team.domain);
const system2 = call2Instructions(cfg.team.sellers, sources, services);

console.log(`Model ${model}, version ${version}, ${testMode ? "test emails" : `sample "${sample}"`}${fresh ? ", fresh calls" : ""}, ${files.length} documents.`);
console.log(`Anthropic spend so far, all runs: ${prior.toFixed(4)} USD. Stops to ask at ${askAt} USD. Kill switch ${cost.kill_switch_per_run_usd} USD per run.`);

// A run fails if a prompt is over its token budget. Token counting is free.
const counter = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
const rawCount = async (text: string) =>
  (await counter.messages.countTokens({ model, system: text, messages: [{ role: "user", content: "." }] })).input_tokens;
const overhead = (await rawCount(".")) - 1; // a small fixed overhead every request carries, left out of the budget
const countOf = async (text: string) => (await rawCount(text)) - overhead;
const sysTokens = await countOf(call1Instructions(team.names, team.domain));
const exTokens = await Promise.all(CALL1_EXAMPLES.map(countOf));
const c2Tokens = await countOf(system2);
console.log(`Prompt budgets. Call 1 instructions ${sysTokens} of ${c1.system_prompt_budget_tokens}, examples ${exTokens.join(" and ")} of ${c1.example_budget_tokens_each} each. Call 2 ${c2Tokens} of ${c2.prompt_budget_tokens}.`);
if (sysTokens > c1.system_prompt_budget_tokens || exTokens.some((t) => t > c1.example_budget_tokens_each) ||
    exTokens.length > c1.examples_in_prompt || c2Tokens > c2.prompt_budget_tokens) {
  console.error("A prompt is over its budget. The run stops before any paid call.");
  process.exit(1);
}

interface CachedCall<T> { attempt: number; parsed: T | null; stopReason: string | null; inputTokens: number; outputTokens: number; costUsd: number; raw: string }
interface Outcome<T> { calls: CachedCall<T>[]; final: T | null; status: "ok" | "needs review" | "failed"; dropped: Dropped[] }

function log(call: 1 | 2, entry: Record<string, unknown>) {
  fs.appendFileSync(logFile, JSON.stringify({ time: new Date().toISOString(), run_id: runId, prompt_version: call === 1 ? CALL1_VERSION : CALL2_VERSION,
    rules_version: call === 1 ? RULES_VERSION : CRM_RULES_VERSION, model, call, ...entry }) + "\n");
}

const keyOf = (...parts: string[]) => createHash("sha1").update(parts.join("\u0000")).digest("hex").slice(0, 20);
let inTok = 0, outTok = 0, runCost = 0, calls = 0;

// One call, one retry when the answer does not parse or a quote fails its check. Saved as it goes.
async function callWithRetry<T>(call: 1 | 2, label: Record<string, string>, cacheKey: string, system: string, user: string,
  schema: typeof Call1Output | typeof Call2Output, maxOut: number, check: (parsed: T) => Dropped[]): Promise<{ o: Outcome<T>; cached: boolean }> {
  // Call 1 answers keep the file names of slice 2, so documents already paid for are not paid again.
  const cacheFile = path.join(cacheDir, call === 1 ? `${cacheKey}.json` : `c2_${cacheKey}.json`);
  if (fs.existsSync(cacheFile)) return { o: JSON.parse(fs.readFileSync(cacheFile, "utf8")), cached: true };
  const o: Outcome<T> = { calls: [], final: null, status: "ok", dropped: [] };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await adapter.call({ system, user, schema, maxOutputTokens: maxOut });
    const c: CachedCall<T> = { attempt, parsed: r.parsed as T | null, stopReason: r.stopReason, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, raw: r.raw };
    o.calls.push(c);
    inTok += c.inputTokens; outTok += c.outputTokens; runCost += c.costUsd; calls++;
    const dropped = c.parsed ? check(c.parsed) : [];
    o.dropped.push(...dropped);
    log(call, { ...label, attempt, retried: attempt > 1, stop_reason: c.stopReason, input_tokens: c.inputTokens, output_tokens: c.outputTokens,
      cost_usd: c.costUsd, spend_total_usd: Number(spend.totalUsd.toFixed(6)), quote_check: { dropped: dropped.length }, raw_output: c.raw });
    if (!c.parsed) { o.status = "failed"; continue; }
    o.final = c.parsed;
    o.status = dropped.length ? "needs review" : "ok";
    if (o.status === "ok") break;
  }
  fs.writeFileSync(cacheFile, JSON.stringify(o));
  return { o, cached: false };
}

const ctx: BuildContext = { crm, team, referenceDate: ref };
const docs = testMode ? files.map(prepare) : allFiles.map(prepare);
const byFile = new Map(docs.map((d) => [d.file, d]));
const outcomes = new Map<string, Outcome<Call1Result>>();
let cached1 = 0, cached2 = 0;

const items: Item[] = [];
const gone: GoneQuiet[] = [];
const dropped: Dropped[] = [];
const modelChanges: CrmChange[] = [];
const modelFlags: CrmFlag[] = [];
let mergedCount = 0, rowsCalled = 0, removedReplies = 0;
const closedIds = new Set<string>(); // items a later document shows done. They set no next step date and no overdue flag

try {
  // ---------------------------------------------------------------- call 1, per document
  for (const file of files) {
    const doc = byFile.get(file)!;
    const { o, cached } = await callWithRetry<Call1Result>(1, { file }, keyOf(model, CALL1_VERSION, system1, file, doc.stripped),
      system1, call1User(doc.stripped, ref), Call1Output, c1.max_output_tokens, (p) => checkQuotes(p, doc).dropped);
    outcomes.set(file, o);
    if (cached) cached1++;
    else console.log(`  call 1, doc ${outcomes.size} of ${files.length}: ${o.calls.length} call(s), status ${o.status}, ${o.final?.items.length ?? 0} item(s), ${o.dropped.length} quote(s) dropped`);
  }

  // ---------------------------------------------------------------- rules on call 1 output
  for (const d of docs) {
    const o = outcomes.get(d.file);
    if (!o) continue;
    dropped.push(...o.dropped);
    if (!o.final) { d.result.status = "failed"; d.result.needs_review = true; continue; }
    const f = o.final;
    d.result.customer_last_message_asks = d.result.last_external_message_from === "customer" ? f.customer_last_message_asks : null;
    d.result.atliq_last_message_expects_answer = d.result.last_external_message_from === "atliq" ? f.atliq_last_message_expects_answer : null;
    d.result.atliq_last_message_carries_proposal = d.result.last_external_message_from === "atliq" ? f.atliq_last_message_carries_proposal : null;
    d.result.needs_review = f.needs_review || o.status !== "ok";
    d.result.instruction_flagged = f.instruction_flagged;
    d.result.status = o.status;
    const open = openReplies(checkQuotes(f, d).kept, d, team);
    for (const x of open.removed) fs.appendFileSync(logFile, JSON.stringify({ time: new Date().toISOString(), run_id: runId, prompt_version: CALL1_VERSION,
      rules_version: RULES_VERSION, model, record: "reply_owed_removed", file: d.file, reason: x.reason, quote: x.item.quote, cost_usd: 0 }) + "\n");
    removedReplies += open.removed.length;
    const { kept, merged } = mergeSamePassage(open.kept);
    mergedCount += merged.length;
    for (const m of merged) fs.appendFileSync(logFile, JSON.stringify({ time: new Date().toISOString(), run_id: runId, prompt_version: CALL1_VERSION,
      rules_version: RULES_VERSION, model, record: "merged_same_passage", file: d.file, kept_type: m.keptType, dropped_type: m.droppedType,
      kept_quote: m.keptQuote, dropped_quote: m.droppedQuote, cost_usd: 0 }) + "\n");
    const built = buildItems(kept, d, ctx);
    items.push(...built);
    const fu = followUps(d, f, built, ctx, cfg.follow_up_rules.nudge_after_days_without_reply);
    if (fu.nudge) items.push(fu.nudge);
    if (fu.quiet) gone.push(fu.quiet);
  }

  // ---------------------------------------------------------------- call 2, per account with evidence
  const ran = docs.filter((d) => outcomes.get(d.file)?.final);
  const targets: { row: (typeof crm)[number] | null; newName: string | null; docs: PreparedDoc[] }[] = [];
  for (const row of crm) {
    const ds = docsForRow(row.lead_id, ran, items, c2.max_documents_per_account);
    if (ds.length) targets.push({ row, newName: null, docs: ds });
  }
  const newNames = [...new Set(ran.flatMap((d) => d.result.accounts.filter((a) => a.startsWith("NEW:"))))];
  for (const n of newNames) {
    const ds = docsForRow(n, ran, items, c2.max_documents_per_account);
    if (ds.length) targets.push({ row: null, newName: n.slice(4), docs: ds });
  }
  for (const t of targets) {
    const id = t.row?.lead_id ?? `NEW:${t.newName}`;
    const rowItems = items.filter((i) => (t.row ? i.lead_id === t.row.lead_id : !i.lead_id && i.account === t.newName));
    const user = call2User(t.row, t.newName, rowItems, t.docs, ref);
    const { o, cached } = await callWithRetry<Call2Result>(2, { lead_id: id }, keyOf(model, CALL2_VERSION, system2, user), system2, user,
      Call2Output, c2.max_output_tokens, (p) => buildCrmChanges(p, t.row, t.newName, t.docs, { sellers: cfg.team.sellers, sources, services, domain: team.domain }).dropped
        .filter((x) => x.reason === "quote_not_found"));
    rowsCalled++;
    if (cached) cached2++;
    else console.log(`  call 2, ${rowsCalled} of ${targets.length}: ${o.calls.length} call(s), status ${o.status}`);
    if (!o.final) continue;
    const built = buildCrmChanges(o.final, t.row, t.newName, t.docs, { sellers: cfg.team.sellers, sources, services, domain: team.domain });
    modelChanges.push(...built.changes);
    modelFlags.push(...built.flags);
    const cl = closedItems(o.final, rowItems, t.docs, team.domain);
    cl.ids.forEach((id) => closedIds.add(id));
    // Each closure is recorded in the run log with the item and the later evidence, so a person can audit it.
    for (const c of cl.closures) fs.appendFileSync(logFile, JSON.stringify({ time: new Date().toISOString(), run_id: runId, prompt_version: CALL2_VERSION,
      rules_version: CRM_RULES_VERSION, model, record: "item_closed", lead_id: id, item_quote: c.itemQuote, item_date: c.itemDate,
      evidence: c.evidence, evidence_file: c.file, evidence_date: c.evidenceDate, cost_usd: 0 }) + "\n");
    dropped.push(...cl.dropped);
    dropped.push(...built.dropped);
  }
} catch (err) {
  if (err instanceof SpendStop) {
    console.error(`\nSTOPPED. ${err.message}`);
    console.error(`This run: ${runCost.toFixed(4)} USD. All runs: ${spend.totalUsd.toFixed(4)} USD. Finished calls are saved and will not be paid again.`);
    process.exit(2);
  }
  throw err;
}

// ------------------------------------------------------------------ write the results
const ran = docs.filter((d) => outcomes.has(d.file));
const next = nextStepChanges(crm, items.filter((i) => !closedIds.has(i.id)), ref);
const results: Results = {
  run: { run_id: runId, prompt_version: version, model, reference_date: ref, documents: ran.length,
    input_tokens: inTok, output_tokens: outTok, cost_usd: Number(runCost.toFixed(6)), duration_seconds: Math.round((Date.now() - started) / 1000) },
  documents: ran.map((d) => d.result),
  items: orderItems(items, ref),
  waiting_customers: waitingCustomers(ran, crm, ref, (d) => outcomes.get(d.file)?.final?.customer_last_message_asks === true),
  gone_quiet: gone,
  crm_changes: [...ruleChanges(ran, crm), ...next.changes, ...modelChanges],
  crm_flags: [...ruleFlags(ran, crm), ...next.flags, ...modelFlags],
  dropped,
};

const name = testMode ? "results_tests.json" : sample === "all" ? (fresh ? "results_run2.json" : "results.json") : `results_${sample}${fresh ? "_run2" : ""}.json`;
writeResults(outDir, name, results, false);

console.log(`\nWrote data/results/${model}/${name}. current.json is unchanged.`);
console.log(`Documents ${ran.length} (${cached1} call 1 answers and ${cached2} call 2 answers reused, not paid again). Model calls this run ${calls}.`);
console.log(`Tokens this run: ${inTok} in, ${outTok} out.`);
console.log(`Cost this run: ${runCost.toFixed(4)} USD at ${candidate.usd_per_million_input_tokens} and ${candidate.usd_per_million_output_tokens} USD per million tokens.`);
console.log(`Anthropic spend, all runs: ${spend.totalUsd.toFixed(4)} USD.`);
console.log(`Items ${results.items.length}, merged ${mergedCount}, reply owed removed by rule ${removedReplies}, items closed by later evidence ${closedIds.size}, CRM changes ${results.crm_changes.length} (${modelChanges.length} from the model), flags ${results.crm_flags.length}, dropped ${dropped.length}.`);
