// Slice 1 only. Compares the rule outputs with the `documents` and `crm.rule_fields` parts of the answer key.
// The key is read from disk at run time. This file holds no company name, lead ID, file name, date or quote.
// Skips when the key or the dataset is not on this machine.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../lib/config.ts";
import { readCrmFile } from "../lib/crm.ts";
import { sameCompanyName } from "../lib/match.ts";
import { listDataset, prepareDocument, ruleChanges, ruleFlags } from "../lib/pipeline.ts";
import type { Team } from "../lib/rules.ts";

const ROOT = process.cwd();
const KEY = path.join(ROOT, "eval", "answer_key.json");
const DATASET = path.join(ROOT, "data", "dataset");
const ready = fs.existsSync(KEY) && fs.existsSync(DATASET);

interface KeyDoc {
  file: string;
  accounts_expected: string[];
  accounts_accept: string[];
  last_external_message_from?: string | null;
  last_external_message_date?: string | null;
}
interface ContactRule { expected: string | null; accept: string[] }

function setup() {
  const key = JSON.parse(fs.readFileSync(KEY, "utf8"));
  const cfg = loadConfig(ROOT);
  const team: Team = { names: [...cfg.team.sellers, ...cfg.team.pre_sales], domain: cfg.team.email_domain };
  const crm = readCrmFile(DATASET);
  const docs = listDataset(DATASET).map((f) => prepareDocument(f, fs.readFileSync(path.join(DATASET, f), "utf8"), crm, team));
  return { keyDocs: key.documents as KeyDoc[], contact: key.crm.rule_fields.last_contact_date as Record<string, ContactRule>, crm, docs };
}

test("who wrote last is right on every email thread", { skip: !ready }, () => {
  const { keyDocs, docs } = setup();
  const threads = keyDocs.filter((d) => d.file.startsWith("emails/"));
  const wrong = threads.filter((k) => {
    const ours = docs.find((d) => d.file === k.file)!.result;
    return ours.last_external_message_from !== (k.last_external_message_from ?? null) ||
      ours.last_external_message_date !== (k.last_external_message_date ?? null);
  });
  console.log(`who wrote last: ${threads.length - wrong.length} of ${threads.length} threads right`);
  assert.equal(threads.length, 34);
  assert.equal(wrong.length, 0, `${wrong.length} thread(s) differ: ${wrong.map((w) => path.basename(w.file)).join(", ")}`);
});

test("the last contact date rule is right on all 40 rows", { skip: !ready }, () => {
  const { contact, crm, docs } = setup();
  const changes = ruleChanges(docs, crm);
  const wrong: string[] = [];
  for (const row of crm) {
    const want = contact[row.lead_id] ?? { expected: null, accept: [] };
    const got = changes.find((c) => c.lead_id === row.lead_id)?.proposed as string | undefined;
    const good = got === want.expected || (!!got && want.accept.includes(got)) || (!got && !want.expected);
    if (!good) wrong.push(`${row.lead_id} got ${got ?? "no change"}, key ${want.expected ?? "no change"}`);
  }
  console.log(`last contact date: ${crm.length - wrong.length} of ${crm.length} rows right`);
  assert.equal(crm.length, 40);
  assert.equal(wrong.length, 0, wrong.join("; "));
});

test("every row with no owner is flagged", { skip: !ready }, () => {
  const { crm, docs } = setup();
  const empty = crm.filter((r) => !r.owner.trim()).map((r) => r.lead_id);
  const flagged = ruleFlags(docs, crm).filter((f) => f.kind === "no_owner").flatMap((f) => f.lead_ids);
  console.log(`no owner: ${empty.filter((id) => flagged.includes(id)).length} of ${empty.length} flagged`);
  assert.equal(empty.length, 5);
  assert.deepEqual(flagged.sort(), empty.sort());
});

test("every missing company is flagged", { skip: !ready }, () => {
  const { keyDocs, crm, docs } = setup();
  const want = [...new Set(keyDocs.flatMap((d) => d.accounts_expected).filter((a) => a.startsWith("NEW:")).map((a) => a.slice(4)))];
  const ours = ruleFlags(docs, crm).filter((f) => f.kind === "missing_company").map((f) => f.company ?? "");
  const found = want.filter((w) => ours.some((o) => sameCompanyName(o, w)));
  const extra = ours.filter((o) => !want.some((w) => sameCompanyName(o, w)));
  console.log(`missing companies: ${found.length} of ${want.length} flagged, ${extra.length} extra`);
  assert.equal(want.length, 5);
  assert.equal(found.length, 5);
  assert.equal(extra.length, 0);
});

test("info. documents linked to the right CRM rows", { skip: !ready }, () => {
  const { keyDocs, docs } = setup();
  const canon = (a: string, list: string[]) =>
    a.startsWith("NEW:") ? list.find((k) => k.startsWith("NEW:") && sameCompanyName(k.slice(4), a.slice(4))) ?? a : a;
  const wrong: string[] = [];
  for (const k of keyDocs) {
    const allowed = [...k.accounts_expected, ...k.accounts_accept];
    const linked = docs.find((d) => d.file === k.file)!.result.accounts.map((a) => canon(a, allowed));
    const good = k.accounts_expected.every((e) => linked.includes(e)) && linked.every((l) => allowed.includes(l));
    if (!good) wrong.push(path.basename(k.file));
  }
  console.log(`account matching (info, scored in slice 3): ${keyDocs.length - wrong.length} of ${keyDocs.length} documents right`);
  if (wrong.length) console.log(`  differ: ${wrong.join(", ")}`);
});
