// Everything the screens need, read at build time on the server. No model call.
// Documents are passed as the model saw them, with the editor notes removed. Raw files are never served.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.ts";
import { readCrmFile, type CrmRow } from "./crm.ts";
import { parseNote } from "./parse.ts";
import { modelInput } from "./text.ts";
import { ruleReplies } from "./rule_replies.ts";
import type { ShownItem } from "./shown.ts";
import type { Results } from "./types.ts";

export interface DocView {
  id: string;
  file: string;
  text: string;
  isEmail: boolean;
  instructionFlagged: boolean;
  needsReview: boolean;
  noteDate: string | null; // a note's date: its Date line, else its title, else its file name
}

export interface ScreenData {
  results: Results;
  items: ShownItem[]; // the results' items plus the rule-made Reply owed cards
  crm: CrmRow[];
  docs: Record<string, DocView>;
  referenceDate: string;
  sellers: string[];
  people: string[];
  replyLimitDays: number;
  nudgeDays: number;
}

export const docIdOf = (file: string) => createHash("sha1").update(file).digest("hex").slice(0, 12);

let cached: ScreenData | null = null;

export function loadScreenData(): ScreenData {
  if (cached) return cached;
  const cfg = loadConfig();
  // Paths are scoped to their folders, so the build traces only the data the screens read.
  if (cfg.data.dataset_folder !== "data/dataset") throw new Error("The screens expect the dataset in data/dataset.");
  const dataset = path.join(process.cwd(), "data", "dataset");
  const results = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "results", "current.json"), "utf8")) as Results;
  const docs: Record<string, DocView> = {};
  for (const d of results.documents) {
    const raw = fs.readFileSync(path.join(dataset, d.file), "utf8");
    docs[d.file] = {
      id: docIdOf(d.file), file: d.file, text: modelInput(raw, d.file), isEmail: d.file.startsWith("emails/"),
      instructionFlagged: d.instruction_flagged, needsReview: d.needs_review,
      noteDate: d.file.startsWith("emails/") ? null : parseNote(modelInput(raw, d.file), d.file).date,
    };
  }
  const crm = readCrmFile(dataset);
  const items: ShownItem[] = [...results.items,
    ...ruleReplies(results.waiting_customers, results.items, (f) => docs[f]?.text ?? null, crm, cfg.team.email_domain)];
  cached = {
    results, items, crm, docs, referenceDate: results.run.reference_date,
    sellers: cfg.team.sellers, people: [...cfg.team.sellers, ...cfg.team.pre_sales],
    replyLimitDays: cfg.follow_up_rules.reply_owed_limit_days, nudgeDays: cfg.follow_up_rules.nudge_after_days_without_reply,
  };
  return cached;
}
