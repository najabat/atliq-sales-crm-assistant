// Builds data/results/eval_summary.json for the How it works page. Numbers only.
// It reads the final reports of the deployed version from eval/reports, which stay on the laptop, and the run log.
// No item ids, quotes, label ids, detail lines or company names go into the file. Run the guard on it afterwards.
//   node scripts/build_eval_summary.ts
import fs from "node:fs";
import path from "node:path";

interface Row { id: string; name: string; result: string; threshold: string; pass: boolean | null; gate: boolean }

const root = process.cwd();
const reports = path.join(root, "eval", "reports");
const current = JSON.parse(fs.readFileSync(path.join(root, "data", "results", "current.json"), "utf8"));
const { model, prompt_version: version } = current.run;
const read = (f: string): Row[] => JSON.parse(fs.readFileSync(path.join(reports, f), "utf8")).rows;
const files = fs.readdirSync(reports).filter((f) => f.startsWith(`report_${model}_${version}_`));
const freshFile = files.find((f) => f.includes("final"));
const storedFile = files.find((f) => !f.includes("final"));
const testsFile = fs.readdirSync(reports).find((f) => f.startsWith(`report_tests_${model}_${version}_`));
if (!freshFile || !storedFile || !testsFile) throw new Error("The final reports for the deployed version are missing.");
const fresh = read(freshFile), stored = read(storedFile), tests = read(testsFile);

// Plain counts for people: "0 owner(s)" becomes "0 owners" and "0 failure(s) of 5" becomes "0 of 5 failed".
const plain = (t: string) => t
  .replace(/(\d+) failure\(s\) of (\d+)/g, "$1 of $2 failed")
  .replace(/(\d+) (\w+)\(s\)/g, (_m, n: string, w: string) => `${n} ${n === "1" ? w : `${w}s`}`);

// A generic label for the one scorer row whose title names a company: it checks the known double entry.
const label = (r: Row) => (r.id === "EV-5" && r.threshold === "flagged" ? "Known double entry flagged" : r.name);

// "78% (32 of 41)" and "87.8% (36 of 41)" become "78% to 87.8%". Equal results stay as they are.
function range(a: string | undefined, b: string | undefined): string {
  if (a === undefined || b === undefined) return a ?? b ?? "";
  if (a === b) return a;
  const num = (s: string) => s.match(/^(-?\d+(?:\.\d+)?)(%?)/);
  const x = num(a), y = num(b);
  if (x && y && x[2] === y[2]) {
    const [lo, hi] = [Number(x[1]), Number(y[1])].sort((m, n) => m - n);
    return lo === hi ? `${lo}${x[2]}` : `${lo}${x[2]} to ${hi}${x[2]}`;
  }
  return `${a}; ${b}`;
}

const measures = fresh.filter((r) => r.id !== "info" && r.id !== "EV-R").map((r) => {
  const s = stored.find((x) => x.id === r.id && x.name === r.name);
  return {
    id: r.id, gate: r.gate, measure: label(r), needs: plain(r.threshold),
    official: { result: plain(r.result), pass: r.pass },
    stored: s ? { result: plain(s.result), pass: s.pass } : null,
    range: plain(r.id === "EV-8" || r.id === "EV-10" ? r.result : range(r.result, s?.result)),
  };
});
const gateTests = tests.filter((r) => r.gate).map((r) => ({ id: r.id, gate: true, measure: r.name, needs: plain(r.threshold),
  official: { result: plain(r.result), pass: r.pass }, stored: null, range: plain(r.result) }));

// Spend from the run log: every model call ever made on this laptop.
const log = path.join(root, "data", "results", model, "run_log.jsonl");
const lines = fs.readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const totalSpend = lines.reduce((s, l) => s + (l.cost_usd ?? 0), 0);

const summary = {
  model, prompt_version: version, reference_date: current.run.reference_date,
  official_run: { run_date: current.run.run_id.slice(0, 10), documents: current.run.documents, input_tokens: current.run.input_tokens,
    output_tokens: current.run.output_tokens, cost_usd: current.run.cost_usd, duration_seconds: current.run.duration_seconds },
  second_run: "the same version rebuilt from stored model answers, used for the consistency measure",
  selection_gates_failed: [...measures, ...gateTests].filter((m) => m.gate && m.official.pass === false).length,
  launch_thresholds_failed: measures.filter((m) => !m.gate && m.official.pass === false).length,
  measures: [...measures, ...gateTests],
  spend_total_usd: Number(totalSpend.toFixed(4)),
  verdict: "Not ready for unattended use. Ready for a supervised pilot where sellers approve every item.",
};
const out = path.join(root, "data", "results", "eval_summary.json");
fs.writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
console.log(`Wrote data/results/eval_summary.json: ${summary.measures.length} measures, ${summary.selection_gates_failed} gates failed, ` +
  `${summary.launch_thresholds_failed} launch thresholds failed, total spend ${summary.spend_total_usd} USD.`);
