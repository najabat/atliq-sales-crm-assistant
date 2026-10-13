// Tests for the pre-push guard. Run with `npm run guard:test` or `node scripts/guard.test.mjs`.
// Everything here is invented. A fake dataset is written to a temporary folder, so no course
// data appears in this tracked file.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GUARD = path.join(path.dirname(fileURLToPath(import.meta.url)), "guard.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guard-test-"));
const data = path.join(tmp, "data", "dataset");
fs.mkdirSync(path.join(data, "emails"), { recursive: true });
fs.mkdirSync(path.join(tmp, "eval"), { recursive: true });

// The fake dataset. Two invented companies, invented leads and invented mail.
fs.writeFileSync(path.join(data, "crm_export.csv"),
  "lead_id,company,contact_name,notes\nL-5001,Zephyrkiln Ceramics,Ola Berg,first call\nL-5002,Vertex Quarry Works,Ian Moss,\"quote sent, waiting\"\n");
const common = "Thanks for the update and have a good week ahead of you all.";
fs.writeFileSync(path.join(data, "emails", "2025-02-03_zephyrkiln_glaze_order.md"),
  `${common}\nWe need the cobalt glaze batch moved to the north kiln by Friday noon.\n`);
fs.writeFileSync(path.join(data, "emails", "2025-02-04_vertex_quarry.md"), `${common}\nPlease confirm the slate count.\n`);
fs.writeFileSync(path.join(data, "emails", "2025-02-05_other.md"), `${common}\nNothing else today.\n`);
fs.writeFileSync(path.join(data, "README.md"), "Data dictionary.\n");
fs.writeFileSync(path.join(tmp, "eval", "answer_key.json"),
  JSON.stringify({ crm: { new_rows: [{ company: "Quillmoor Analytics", company_accept: ["Quillmoor"] }] }, obligations: [] }));

let passed = 0, failed = 0;
const run = (name, files, expectFail, extra = []) => {
  const list = [];
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(tmp, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, body); list.push(rel);
  }
  const out = spawnSync(process.execPath, [GUARD, "--root", tmp, ...extra, "--files", ...list], { encoding: "utf8" });
  const text = out.stdout + out.stderr;
  const leaked = /cobalt glaze|zephyrkiln ceramics|L-5001|quillmoor/i.test(text.replace(/[\w./-]+\.(md|mjs|ts|json|txt)/g, ""));
  // A failure must be a clean guard failure, never a crash.
  const crashed = /Error|\n\s+at /.test(out.stderr);
  const ok = !crashed && !leaked && (expectFail ? out.status === 1 && /guard: FAIL/.test(text) : out.status === 0);
  ok ? passed++ : failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${leaked ? " (the output showed matched text)" : ""}`);
  for (const rel of list) fs.rmSync(path.join(tmp, rel), { force: true });
};

// Must pass. Legitimate project content.
run("generic code passes", { "lib/rules.ts": "export const waitingDays = (a, b) => Math.round((b - a) / 86400000);\n" }, false);
run("AtliQ and staff names pass", { "README.md": "AtliQ sellers Karandeep and Jay approve every change.\n" }, false);
run("a common word that starts a company name passes", { "lib/model.ts": "// Vertex AI is not used. Gemini runs through AI Studio.\n" }, false);
run("an invented lead ID passes", { "docs/x.md": "An example row is L-9001.\n" }, false);
run("wording found in many dataset files passes", { "lib/prompt.ts": `const example = "${common}";\n` }, false);
run("the CRM export file name passes", { "lib/load.ts": "const file = 'crm_export.csv';\n" }, false);
run("the run summary in eval/reports passes", { "eval/reports/run_summary.md": "| model | prompt | cost |\n" }, false);
run("an image file is skipped", { "public/logo.png": "\u0000\u0001binary" }, false);

// Must fail. Real leaks.
run("a full company name fails", { "lib/x.ts": "// see Zephyrkiln Ceramics\n" }, true);
run("a distinctive first word fails", { "lib/x.ts": "const a = 'zephyrkiln';\n" }, true);
run("a company name in an email domain fails", { "test/x.test.ts": "expect(match('ola@zephyrkiln.no')).toBe(true);\n" }, true);
run("a new row company from the answer key fails", { "test/x.test.ts": "it('flags Quillmoor Analytics', () => {});\n" }, true);
run("a two word name with a common first word fails", { "test/x.test.ts": "// Vertex Quarry Works row\n" }, true);
run("a dataset lead ID fails", { "test/rules.test.ts": "expect(row('L-5001')).toBeTruthy();\n" }, true);
run("a dataset file name fails", { "test/x.test.ts": "load('emails/2025-02-03_zephyrkiln_glaze_order.md');\n" }, true);
run("copied dataset text fails", { "lib/prompt.ts": "const ex = 'moved to the north kiln by Friday noon';\n" }, true);
run("copied text with other spacing and quotes fails", { "lib/prompt.ts": "// “We need the cobalt glaze   batch moved”\n" }, true);
run("a tracked dataset path fails", { "data/dataset/emails/copy.md": "x\n" }, true);
run("tracked cases.json fails", { "eval/cases.json": "{}\n" }, true);
run("a tracked report fails", { "eval/reports/full_report.json": "{}\n" }, true);
run("a tracked env file fails", { ".env.local": "X=1\n" }, true);
run("a missing dataset fails closed", { "lib/ok.ts": "export {};\n" }, true, ["--data", path.join(tmp, "nowhere")]);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} guard tests passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
