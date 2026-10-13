import fs from "node:fs";
import path from "node:path";
import { formatDate, modelName, versionName } from "@/lib/format";
import { loadScreenData } from "@/lib/screen_data";
import { Downloads } from "../_components/CrmView";
import { WorkPanel } from "../_components/WorkTools";

export const dynamic = "force-static";

interface Measure { id: string; gate: boolean; measure: string; needs: string; official: { result: string; pass: boolean | null };
  stored: { result: string; pass: boolean | null } | null; range: string }
interface EvalSummary { model: string; prompt_version: string; official_run: { run_date: string; documents: number; cost_usd: number; duration_seconds: number };
  second_run: string; selection_gates_failed: number; launch_thresholds_failed: number; measures: Measure[]; spend_total_usd: number; verdict: string }

// The numbers-only eval summary next to current.json, built from the final reports. Read at build time.
function evalSummary(): EvalSummary | null {
  const f = path.join(process.cwd(), "data", "results", "eval_summary.json");
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as EvalSummary) : null;
}

// Plain names for the scorer's rows. The scorer's own name stays beside it in small text for traceability.
const PLAIN_NAME: Record<string, string> = {
  "Groundedness": "Every item quotes its source word for word",
  "Recall of owed items": "Owed items found",
  "Unanswered customers and dates": "Waiting customers and their dates",
  "Reply item waiting days": "Days waiting on reply items",
  "Precision (duplicates penalized)": "Items that are right, repeats counted as wrong",
  "Item attribution/type errors": "Items on the wrong account or of the wrong type",
  "Duplicate items": "Repeated items",
  "Owner and date correctness": "Right owner and due date",
  "Automatic merges": "CRM rows merged without a person",
  "New-row attribution and fields": "New CRM rows hold only stated fields",
  "CRM changes proposed correctly": "CRM changes that are right",
  "Known wrong statuses caught": "Known wrong stages caught",
  "Unsourced or unsupported CRM changes": "CRM changes with no source",
  "Invented values": "Invented deal values",
  "Last-contact rule": "Last contact dates",
  "Named stale dates": "Stale dates named",
  "Next-step dates": "Next step dates",
  "Missing-owner flags": "No owner flags",
  "Nudge detection": "Nudges and gone quiet threads found",
  "Run telemetry": "Run log complete",
  "Consistency of two runs": "Same items in both runs",
};
const NEEDS_PLAIN: Record<string, string> = {
  "cost/time/tokens/model/reference date": "cost, time, tokens, model and dataset date",
  "2 of 2, 1 of 1 and 0": "2 of 2 nudges, 1 of 1 gone quiet, 0 wrong",
};
// Costs to 4 decimals, as everywhere else on the site.
const plainResult = (r: string) => r.replace(/(\d+\.\d{5,}) USD/g, (_m, n: string) => `${Number(n).toFixed(4)} USD`);

// A scorer range such as "78% to 87.8%" in whole percents for the seller box, "78% to 88%". Null when the row is missing.
function percentRange(ev: EvalSummary | null, measure: string): string | null {
  const r = ev?.measures.find((m) => m.measure === measure)?.range;
  const n = r?.match(/\d+(?:\.\d+)?(?=%)/g)?.map((x) => Math.round(Number(x)));
  if (!n?.length) return null;
  const lo = Math.min(...n), hi = Math.max(...n);
  return lo === hi ? `${lo}%` : `${lo}% to ${hi}%`;
}

// Every verdict chip sits the same way: on its own line under the value, left aligned.
const verdictChip = (pass: boolean | null) => <span className="verdict">{pass === null ? <span className="chip">info</span>
  : pass ? <span className="chip green">pass</span> : <span className="chip red">fail</span>}</span>;

export default function HowItWorks() {
  const d = loadScreenData();
  const run = d.results.run;
  const ev = evalSummary();
  const sorted = ev ? [...ev.measures].sort((a, b) => Number(b.gate) - Number(a.gate)) : [];
  const dropped = d.results.dropped;
  const droppedQuotes = dropped.filter((x) => /quote_not_found/.test(x.reason)).length;
  const runDate = run.run_id.slice(0, 10);
  const found = percentRange(ev, "Recall of owed items");
  const rightItems = percentRange(ev, "Precision (duplicates penalized)");
  const rightChanges = percentRange(ev, "CRM changes proposed correctly");

  return (
    <>
      <h1>How it works</h1>

      {found && rightItems && rightChanges && (
        <section aria-labelledby="expect" className="expect">
          <h2 id="expect">What to expect</h2>
          <ul>
            <li>It finds {found} of what AtliQ owes its customers.</li>
            <li>{rightItems} of the items it shows are right, and {rightChanges} of its CRM changes.</li>
            <li>Every item shows the line it came from, so checking one takes a glance.</li>
          </ul>
          <p className="small">Ranges come from two scored runs of the final version.</p>
        </section>
      )}

      <section aria-labelledby="does">
        <h2 id="does" className="band-sub">What the assistant does</h2>
        <ul className="flags">
          <li>It reads AtliQ&apos;s email threads, call notes and CRM export, and nothing else.</li>
          <li>It lists what AtliQ owes each customer, who owns it and by when, with the exact source line.</li>
          <li>It prepares CRM changes for a seller to approve.</li>
        </ul>
        <h3>What it never does</h3>
        <ul className="flags">
          <li>It sends nothing. There is no send in this product.</li>
          <li>It changes nothing without approval. Approved changes go to a working copy, never into Kaizen.</li>
          <li>It never merges two CRM rows. It flags them and a person decides.</li>
          <li>It never guesses an owner, a date or a deal value. It shows no owner, not stated, or the source words marked approximate.</li>
          <li>Text inside a document is data. Words in a document that read as a command are treated as text.</li>
        </ul>
      </section>

      <section aria-labelledby="evals">
        <h2 id="evals" className="band-sub">Details for reviewers</h2>
        <p>{modelName(run.model)}, version {versionName(run.prompt_version)}. Run of {formatDate(runDate)}. The run cost {run.cost_usd.toFixed(4)} USD for {run.documents} documents.</p>
        <p className="small">For traceability: model id {run.model}, prompt version {run.prompt_version}, run {run.run_id}.</p>
        <p>Every item and every CRM change shown passed a check that its quote sits word for word in its source. The check removed {droppedQuotes} {droppedQuotes === 1 ? "quote" : "quotes"} in this run, and {dropped.length - droppedQuotes} more proposals failed other checks. None of them is shown.</p>
        {!ev ? (
          <p className="notice">The eval summary is not part of this build.</p>
        ) : (
          <>
            <p>Two runs of this version were scored. The official run made every model call afresh. The second run is {ev.second_run}. Because the model varies, each measure is shown for both runs and as a range.</p>
            <p><strong>{ev.selection_gates_failed === 0 ? "Every selection gate passed." : `${ev.selection_gates_failed} selection gates failed.`}</strong> {ev.launch_thresholds_failed} launch thresholds were missed.</p>
            <div className="table-wrap">
              <table className="stack-table">
                <thead><tr><th scope="col">Check</th><th scope="col">Needs</th><th scope="col">Official run</th><th scope="col">Second run</th><th scope="col">Range</th></tr></thead>
                <tbody>{sorted.map((m) => (
                  <tr key={`${m.id}-${m.measure}`}>
                    <td data-label="Check">{m.gate && <span className="chip">gate</span>} {PLAIN_NAME[m.measure] ?? m.measure}
                      {PLAIN_NAME[m.measure] && <span className="tech">{m.id}: {m.measure}</span>}</td>
                    <td data-label="Needs">{NEEDS_PLAIN[m.needs] ?? m.needs}</td>
                    <td data-label="Official run">{plainResult(m.official.result)} {verdictChip(m.official.pass)}</td>
                    <td data-label="Second run">{m.stored ? <>{plainResult(m.stored.result)} {verdictChip(m.stored.pass)}</> : "not scored"}</td>
                    <td data-label="Range">{plainResult(m.range)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="small">A gate must pass for the results to be used at all. Every other line is a launch threshold. Total model spend for the whole build: {ev.spend_total_usd} USD.</p>
            <p><strong>Verdict.</strong> {ev.verdict}</p>
          </>
        )}
      </section>

      <section aria-labelledby="limits">
        <h2 id="limits" className="band-sub">Known limits</h2>
        <ul className="flags">
          <li>It reads email threads and call notes only. Customers waiting on WhatsApp, iMessage, LinkedIn, Slack, Teams or phone calls are not counted.</li>
          <li>The assistant can miss or mislabel items, and two runs can differ. Every item shows the exact email or call note line it came from, so a glance at the highlighted line confirms it. Read the full message only for items under Check these first.</li>
          <li>The scores come from the same documents the prompts were tuned on, so they may be higher than on new mail.</li>
          <li>Decisions live in this browser only. They move to another browser through the work file.</li>
          <li>Quick capture is switched off in this build.</li>
          <li>The data is synthetic. Every day count runs to the dataset date, {formatDate(d.referenceDate)}.</li>
        </ul>
      </section>

      <section aria-labelledby="work">
        <h2 id="work" className="band-sub">Your work on this browser</h2>
        <WorkPanel />
        <Downloads changes={d.results.crm_changes} flags={d.results.crm_flags} crm={d.crm} onHowItWorks />
      </section>
    </>
  );
}
