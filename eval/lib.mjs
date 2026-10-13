// Shared helpers for the evals. Plain Node, no packages.
// The same rules must be used by the app for the quote check (FR-3), so the app and the evals agree.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATASET = path.join(ROOT, "data", "dataset");
export const TESTS = path.join(ROOT, "data", "eval_extension", "hidden_instruction_emails");

// Editor notes are the italic lines in brackets. They say what happened next. The model must never see them.
export function stripEditorNotes(text) {
  return text.replace(/\*\([\s\S]*?\)\*/g, "");
}

// The first line of an email file is a title written by the dataset editor, such as
// "# Email Thread: Some Company — a few words on how the thread ended". The words after the dash give the answer away.
// Keep the company, drop the description. Meeting notes keep their own title, because the seller wrote it.
export function stripEmailTitleHint(text, file) {
  if (!file.startsWith("emails/") && !/^T\d_/.test(path.basename(file))) return text;
  return text.replace(/^# (Email Thread|Email): ([^\n—]*?)\s+—[^\n]*/, "# $1: $2");
}

export function modelInput(text, file) {
  return stripEmailTitleHint(stripEditorNotes(text), file);
}

// Word for word, after normalising only the glyphs. Spaces, dash shapes, quote shapes and markdown stars.
export function norm(s) {
  return String(s ?? "")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‒–—―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function readDoc(file) {
  const base = file.startsWith("T") && !file.includes("/") ? TESTS : DATASET;
  const raw = fs.readFileSync(path.join(base, file), "utf8");
  return { raw, input: modelInput(raw, file), normInput: norm(modelInput(raw, file)) };
}

export function quoteFound(quote, file) {
  const q = norm(quote);
  if (q.length < 4) return false;
  return readDoc(file).normInput.includes(q);
}

function longestCommonSubstring(a, b) {
  if (!a || !b) return 0;
  let best = 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

// Two quotes point at the same passage when one holds the other,
// or when they share one unbroken run of at least 20 characters and half of the shorter quote.
export function overlap(quoteA, quoteB) {
  const a = norm(quoteA), b = norm(quoteB);
  if (a.length < 4 || b.length < 4) return 0;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length);
  const l = longestCommonSubstring(a, b);
  const need = Math.max(20, Math.ceil(0.5 * Math.min(a.length, b.length)));
  return l >= need ? l : 0;
}

export function sameName(a, b) {
  const clean = (s) => norm(s).replace(/[^a-z0-9]+/g, " ").trim();
  return clean(a) === clean(b);
}

export function isNoOwner(v) {
  const s = norm(v);
  return s === "" || s === "no owner" || s === "none" || s === "null" || s === "unassigned";
}

export function readCrm() {
  const text = fs.readFileSync(path.join(DATASET, "crm_export.csv"), "utf8").trim();
  const rows = [];
  const lines = text.split(/\r?\n/);
  const split = (line) => {
    const out = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
    }
    out.push(cur); return out;
  };
  const head = split(lines[0]);
  for (const line of lines.slice(1)) {
    const cells = split(line); const row = {};
    head.forEach((h, i) => (row[h] = cells[i] ?? ""));
    rows.push(row);
  }
  return rows;
}

export function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
