// Must-find items surfaced at account level that the scorer cannot credit, because the item carries two candidate
// rows and no single lead ID. Najabat's decision C, round 2. A scorer limitation only: it changes no score or gate.
// Run only after a version is frozen and scored. Reads the ignored answer key at run time and writes to the ignored
// eval/reports folder. Prints obligation ids, never quotes.
//   node scripts/two_row_list.ts data/results/<model>/results.json eval/reports/two_row_list_<version>.md
import fs from "node:fs";
import path from "node:path";

const [resultsFile, outFile] = process.argv.slice(2);
const root = process.cwd();
const { overlap } = await import(new URL(`file:///${path.join(root, "eval", "lib.mjs").replace(/\\/g, "/")}`).href);
const key = JSON.parse(fs.readFileSync(path.join(root, "eval", "answer_key.json"), "utf8"));
const results = JSON.parse(fs.readFileSync(resultsFile, "utf8"));

interface Label { id: string; file: string; spans: string[]; tier: string; obligation: string; type: string; types_accept: string[] }
interface Obligation { id: string; lead_id: string | null }
const typeOk = (t: string, l: Label) => l.types_accept.includes("any") || t === l.type || l.types_accept.includes(t);

const rows: string[] = [];
const seen = new Set<string>();
for (const item of results.items as { file: string; type: string; quote: string; candidate_lead_ids?: string[] }[]) {
  if (!item.candidate_lead_ids?.length) continue;
  for (const l of key.labels as Label[]) {
    if (l.tier !== "must" || l.file !== item.file || !typeOk(item.type, l)) continue;
    if (!l.spans.some((s) => overlap(item.quote, s))) continue;
    const ob = (key.obligations as Obligation[]).find((o) => o.id === l.obligation);
    if (!ob?.lead_id || !item.candidate_lead_ids.includes(ob.lead_id) || seen.has(ob.id)) continue;
    seen.add(ob.id);
    rows.push(`| ${ob.id} | ${path.basename(item.file)} | ${item.type} | ${item.candidate_lead_ids.join(", ")} | ${ob.lead_id} |`);
  }
}

const out = [
  `# Must-find items surfaced at account level, not creditable by the scorer`,
  ``,
  `Results: ${results.run.run_id}, version ${results.run.prompt_version}.`,
  `Each item below was surfaced with two candidate CRM rows and no lead ID, under the two-row rule (decision C).`,
  `The scorer credits an item only on one lead ID, so it counts these as missed. This list does not change any score or gate.`,
  ``,
  `| Obligation | File | Item type | Candidate rows | Row the key names |`,
  `|---|---|---|---|---|`,
  ...rows,
  ``,
  `${rows.length} must-find obligation(s).`,
].join("\n");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, out + "\n");
console.log(`${rows.length} must-find obligation(s) surfaced at account level: ${[...seen].join(", ") || "none"}. Written to ${outFile}`);
