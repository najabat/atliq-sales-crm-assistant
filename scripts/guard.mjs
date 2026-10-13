// Pre-push guard. Run before every push with `npm run guard` or `node scripts/guard.mjs`.
// It fails when a Git-tracked file holds course data, either a whole ignored path or
// dataset content copied into a tracked file. It prints only the file, the line and the
// kind of match. It never prints the matched text.
//
// Reference data is read at run time from the local dataset and the ignored answer key.
// This file itself names no company, lead, file or quote from the dataset.
//
// Usage
//   node scripts/guard.mjs                       checks `git ls-files` in this folder
//   node scripts/guard.mjs --root DIR --data DIR --files a b c   used by the tests
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
const ROOT = path.resolve(opt("--root") || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const DATA = path.resolve(opt("--data") || path.join(ROOT, "data", "dataset"));
const KEY = path.join(ROOT, "eval", "answer_key.json");
const WINDOW = 30;

// Paths that must never be tracked. They match the course data lines of .gitignore.
const BLOCKED_PATHS = [
  /^data\/dataset\//, /^data\/results\//, /^eval\/answer_key\.json$/, /^eval\/ANSWER_KEY\.md$/,
  /^eval\/OPEN_LABELS\.md$/, /^eval\/cases\.json$/, /^eval\/fixtures\//, /^eval\/make_fixture\.mjs$/,
  /^docs\/PRD\.md$/, /^eval\/report[^/]*\.json$/, /^eval\/reports\/(?!run_summary\.md$)/,
  /(^|\/)\.env(\.|$)(?!example$)/,
];

// Ordinary English words that are also the first word of some company name.
// A one word name or a first word like this only counts as part of a longer full name.
// Such words are also common in code, such as a cloud product name, so they would raise false alarms.
const COMMON = new Set(["acme", "harbor", "sunrise", "vertex", "nimbus", "global",
  "smart", "green", "cloud", "data", "fresh", "retail", "travel", "urban", "steel", "pixel", "cargo", "clear",
  "health", "ocean", "shop", "volt", "blue", "north", "summit", "pioneer", "apex", "nova", "zenith"]);

const fail = (msg) => { console.error(`guard: FAIL ${msg}`); process.exitCode = 1; };
const normText = (s) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, "-").replace(/\*\*/g, "").replace(/\s+/g, " ");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p)); else out.push(p);
  }
  return out;
}

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------- reference data, local only
if (!fs.existsSync(DATA)) {
  fail(`the dataset folder is missing, so content cannot be checked. Place the course dataset in ${path.relative(ROOT, DATA) || DATA}`);
  process.exit(1);
}
const dataFiles = listFiles(DATA);
const companies = new Set(), leads = new Set(), stems = new Set();
const docs = [];
for (const f of dataFiles) {
  const text = fs.readFileSync(f, "utf8");
  if (f.endsWith(".csv")) {
    const [head, ...rows] = parseCsv(text);
    const ci = head.indexOf("company"), li = head.indexOf("lead_id");
    for (const r of rows) { if (r[ci]) companies.add(r[ci].trim()); if (r[li]) leads.add(r[li].trim()); }
  }
  const base = path.basename(f).replace(/\.[^.]+$/, "");
  if (/^\d{4}-\d{2}-\d{2}_/.test(base)) stems.add(base); // the dated email and note files
  docs.push(normText(text));
}
if (fs.existsSync(KEY)) {
  const key = JSON.parse(fs.readFileSync(KEY, "utf8"));
  for (const r of key.crm?.new_rows || []) { companies.add(r.company); (r.company_accept || []).forEach((c) => companies.add(c)); }
  for (const o of key.obligations || []) if (o.account) companies.add(o.account);
}
const nameTerms = new Set();
for (const c of companies) {
  const clean = c.replace(/[?!]+$/, "").trim();
  const words = clean.split(/\s+/), first = words[0];
  if (words.length > 1 && clean.length >= 4) nameTerms.add(clean.toLowerCase());
  const camel = /[a-z][A-Z]/.test(first), caps = /^[A-Z]{5,}$/.test(first);
  if (camel || caps || (first.length >= 6 && !COMMON.has(first.toLowerCase()))) nameTerms.add(first.toLowerCase());
}
const nameRes = [...nameTerms].map((t) => new RegExp(`(^|[^a-z0-9])${escapeRe(t)}([^a-z0-9]|$)`, "i"));
const leadRe = /\bL-\d{4}\b/g;

// Distinctive text. Windows of 30 characters that start on a word. A window found in 3 or
// more dataset files is common wording, such as a greeting, and does not count.
const df = new Map();
for (const d of docs) {
  const seen = new Set();
  for (let i = 0; i + WINDOW <= d.length; i++) {
    if (i > 0 && d[i - 1] !== " ") continue;
    const w = d.slice(i, i + WINDOW);
    if (!seen.has(w)) { seen.add(w); df.set(w, (df.get(w) || 0) + 1); }
  }
}
const distinctive = new Set([...df].filter(([, n]) => n <= 2).map(([w]) => w));

// ---------------------------------------------------------------- the files to check
let files = [];
const fi = args.indexOf("--files");
if (fi > -1) files = args.slice(fi + 1).filter((a) => !a.startsWith("--"));
else files = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);

let checked = 0;
for (const rel of files) {
  const posix = rel.split(path.sep).join("/");
  if (BLOCKED_PATHS.some((re) => re.test(posix))) { fail(`${posix} is course data and must not be tracked`); continue; }
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) continue;
  const buf = fs.readFileSync(abs);
  if (buf.includes(0)) continue; // binary, such as an image
  checked++;
  const lines = buf.toString("utf8").split("\n");
  lines.forEach((line, n) => {
    const at = `${posix}:${n + 1}`;
    for (const m of line.match(leadRe) || []) if (leads.has(m)) { fail(`${at} holds a dataset lead ID`); break; }
    if (nameRes.some((re) => re.test(line))) fail(`${at} holds a dataset company name`);
    const low = line.toLowerCase();
    if ([...stems].some((s) => low.includes(s.toLowerCase()))) fail(`${at} holds a dataset file name`);
    const t = normText(line);
    for (let i = 0; i + WINDOW <= t.length; i++) {
      if (i > 0 && t[i - 1] !== " ") continue;
      if (distinctive.has(t.slice(i, i + WINDOW))) { fail(`${at} holds text copied from the dataset`); break; }
    }
  });
}
if (!process.exitCode) console.log(`guard: OK. ${checked} tracked text files checked, no course data found.`);
