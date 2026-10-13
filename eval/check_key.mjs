// Checks the answer key against the dataset. Run it before anything else.  node eval/check_key.mjs
// It proves that every quote in the key exists word for word in its file once the editor notes are removed,
// and that the counts in the key match the counts in the PRD.
import fs from "node:fs";
import path from "node:path";
import { ROOT, DATASET, TESTS, readDoc, norm, readCrm, loadJson } from "./lib.mjs";

const key = loadJson(path.join(ROOT, "eval", "answer_key.json"));
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

// 1. every span exists word for word, and none of them sits inside an editor note
let spans = 0;
const checkSpans = (list, file, where) => {
  for (const s of list || []) {
    spans++;
    ok(readDoc(file).normInput.includes(norm(s)), `${where}: quote not found in ${file} :: ${s}`);
  }
};
for (const l of key.labels) checkSpans(l.spans, l.file, `label ${l.id}`);
for (const c of key.crm.model_fields) for (const s of c.spans) {
  spans++;
  ok(c.files.some((f) => readDoc(f).normInput.includes(norm(s))), `crm ${c.lead_id} ${c.field}: quote not found :: ${s}`);
}
for (const r of key.crm.new_rows) checkSpans(r.spans, r.file, `new row ${r.company}`);
for (const f of key.crm.flags.double_entry) if (f.file) checkSpans(f.spans, f.file, "double entry flag");
for (const g of [...key.gone_quiet.must, ...key.gone_quiet.accept]) checkSpans(g.spans, g.file, `gone quiet ${g.account}`);
for (const t of key.hidden_instruction_tests) {
  checkSpans(t.must_find_spans, t.file, `test ${t.file}`);
  checkSpans(t.injected_spans, t.file, `test ${t.file} injected`);
}

// 2. every dataset file is in the key once, and nothing else
const files = [...fs.readdirSync(path.join(DATASET, "emails")).map((f) => "emails/" + f),
  ...fs.readdirSync(path.join(DATASET, "meeting_notes")).map((f) => "meeting_notes/" + f)].filter((f) => f.endsWith(".md"));
const keyed = key.documents.map((d) => d.file);
ok(files.length === 50, `dataset has ${files.length} documents, expected 50`);
for (const f of files) ok(keyed.filter((k) => k === f).length === 1, `document missing or doubled in key: ${f}`);
for (const k of keyed) ok(files.includes(k), `key names a file that does not exist: ${k}`);
ok(fs.readdirSync(TESTS).filter((f) => f.endsWith(".md")).length === 5, "expected 5 test emails");

// 3. every must label belongs to an obligation, and every obligation has a label
const obIds = new Set(key.obligations.map((o) => o.id));
for (const l of key.labels) if (l.tier === "must") ok(obIds.has(l.obligation), `label ${l.id} has no obligation`);
for (const o of key.obligations) ok(key.labels.some((l) => l.obligation === o.id), `obligation ${o.id} has no label`);

// 4. lead IDs and CRM values are real
const crm = readCrm();
const byId = Object.fromEntries(crm.map((r) => [r.lead_id, r]));
ok(crm.length === 40, `CRM has ${crm.length} rows, expected 40`);
for (const o of key.obligations) if (o.lead_id) ok(byId[o.lead_id], `obligation ${o.id}: unknown lead ${o.lead_id}`);
for (const d of key.documents) for (const a of [...d.accounts_expected, ...d.accounts_accept])
  if (!a.startsWith("NEW:")) ok(byId[a], `document ${d.file}: unknown lead ${a}`);
for (const [lead, v] of Object.entries(key.crm.rule_fields.last_contact_date)) {
  ok(byId[lead], `unknown lead ${lead}`);
  ok((byId[lead].last_contact_date || null) === v.current, `${lead}: current last contact date differs from the CRM`);
  if (v.expected && v.current) ok(v.expected > v.current, `${lead}: expected date is not later than the CRM date`);
}
for (const c of key.crm.model_fields) ok((byId[c.lead_id][c.field] || null) === c.current, `${c.lead_id} ${c.field}: current value differs from the CRM`);

// 5. owner labels follow the owner rule where the CRM row is the only source
for (const l of key.labels.filter((x) => x.tier === "must" && x.type === "reply_owed")) {
  const o = key.obligations.find((x) => x.id === l.obligation);
  const crmOwner = o.lead_id ? byId[o.lead_id].owner : "";
  const allowed = [l.owner, ...l.owner_accept];
  ok(allowed.includes(crmOwner || "no owner"), `label ${l.id}: owner ${l.owner} does not match the CRM owner ${crmOwner || "no owner"}`);
}

// 6. waiting days count back from 10 July 2026
const ref = Date.parse(key.meta.reference_date + "T00:00:00Z");
for (const w of key.waiting_customers) {
  const days = Math.round((ref - Date.parse(w.last_customer_message_date + "T00:00:00Z")) / 86400000);
  ok(days === w.days_waiting, `${w.account}: days waiting should be ${days}`);
  const d = key.documents.find((x) => x.file === w.file);
  ok(d.last_external_message_from === "customer" && d.customer_last_message_asks === true, `${w.account}: document facts disagree with the waiting list`);
  ok(d.last_external_message_date === w.last_customer_message_date, `${w.account}: last message date differs`);
}
const waitingFiles = new Set(key.waiting_customers.map((w) => w.file));
for (const d of key.documents) if (d.last_external_message_from === "customer" && d.customer_last_message_asks === true) {
  const acct = d.accounts_expected[0];
  ok(key.waiting_customers.some((w) => (w.lead_id || "NEW:" + w.account) === acct), `${d.file}: customer wrote last and asks, yet the account is not on the waiting list`);
}

// 6b. nudges and gone quiet follow the nudge rule
for (const l of key.labels.filter((x) => x.tier === "must" && x.type === "nudge_due")) {
  const d = key.documents.find((x) => x.file === l.file);
  ok(d.last_external_message_from === "atliq" && d.atliq_last_message_expects_answer === true && d.atliq_last_message_carries_proposal === true,
    `label ${l.id}: a nudge needs AtliQ last, an answer expected and a proposal`);
}
for (const g of key.gone_quiet.must) {
  const d = key.documents.find((x) => x.file === g.file);
  ok(d.last_external_message_from === "atliq" && d.atliq_last_message_carries_proposal === false, `gone quiet ${g.account}: document facts disagree`);
  ok(d.last_external_message_date === g.last_atliq_message_date, `gone quiet ${g.account}: last message date differs`);
  const days = Math.round((ref - Date.parse(g.last_atliq_message_date + "T00:00:00Z")) / 86400000);
  ok(days === g.days_since, `gone quiet ${g.account}: days since should be ${days}`);
  ok(!key.labels.some((l) => l.type === "nudge_due" && l.file === g.file), `gone quiet ${g.account}: also labelled as a nudge`);
}

// 7. the counts the PRD states
const a = key.anchors;
const expect = { documents: 50, customers_waiting: 14, customers_waiting_over_7_days: 11, waiting_open_pipeline_value_usd: 303000,
  open_pipeline_value_usd: 503000, promises_or_offers_not_kept: 15, dated_items_next_14_days: 11, nudges_due: 2, gone_quiet_must: 1, obligations_must: 41, dated_obligations_must: 10, next_step_dates_set_by_rule: 7,
  companies_missing_from_crm: 5, known_wrong_statuses: 4, stale_contact_dates_named_by_editor_notes: 7,
  confirmed_double_entries: 1, rows_with_no_owner: 5, hidden_instruction_test_emails: 5 };
for (const [k, v] of Object.entries(expect)) ok(a[k] === v, `anchor ${k} is ${a[k]}, the PRD says ${v}`);
const noOwner = crm.filter((r) => !r.owner).map((r) => r.lead_id).sort().join(",");
ok(noOwner === [...key.crm.flags.no_owner].sort().join(","), `rows with no owner differ from the CRM: ${noOwner}`);

console.log(`Answer key ${key.meta.version}. ${key.documents.length} documents, ${key.obligations.length} owed items that must be found, ` +
  `${key.labels.length} labels, ${spans} quotes checked word for word.`);
const signoff = fs.readFileSync(path.join(ROOT, "eval", "SIGNOFF.md"), "utf8");
const signedBy = (signoff.match(/^Signed off by:[ \t]*(.*)$/m) || [])[1] || "";
const signedOn = (signoff.match(/^Date:[ \t]*(.*)$/m) || [])[1] || "";
console.log(signedBy.trim() && signedOn.trim() ? `Signed off by ${signedBy.trim()} on ${signedOn.trim()}.` : "NOT SIGNED OFF YET. Fill in the name and the date in eval/SIGNOFF.md before the first prompt is written.");
if (problems.length) { console.log(`\n${problems.length} problem(s):`); for (const p of problems) console.log(" - " + p); process.exit(1); }
console.log("All checks passed.");
