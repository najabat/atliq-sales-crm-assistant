// Turns call 1 output into verified items. Code decides every rule here, never the model.
import type { CrmRow } from "./crm.ts";
import { isClosed } from "./crm.ts";
import { sameCompanyName } from "./match.ts";
import type { EmailDoc, Message } from "./parse.ts";
import type { PreparedDoc } from "./pipeline.ts";
import { stableId } from "./pipeline.ts";
import type { Call1Result } from "./prompts/call1.ts";
import { addDays, daysBetween, isAtliqAddress, type Team } from "./rules.ts";
import { norm, quoteFoundIn } from "./text.ts";
import type { Dropped, GoneQuiet, Item } from "./types.ts";

// Version of the rules applied to the model output. Raised on every change, apart from the prompt version.
export const RULES_VERSION = "r7";

type ModelItem = Call1Result["items"][number];

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// A firm date counts only when its day and month are written in the document.
export function dayMonthInText(date: string, text: string): boolean {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const day = Number(m[3]), month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const t = text.toLowerCase();
  if (t.includes(date)) return true;
  const name = MONTHS[month - 1], short = name.slice(0, 3);
  const mon = `(?:${name}|${short}\\.?)`;
  const d = `0?${day}(?:st|nd|rd|th)?`;
  const patterns = [
    new RegExp(`\\b${d}\\s+(?:of\\s+)?${mon}\\b`),
    new RegExp(`\\b${mon}\\s+${d}\\b`),
    new RegExp(`(?<![\\d/])0?${day}[/.]0?${month}(?![\\d])`),
  ];
  return patterns.some((p) => p.test(t));
}

// "by Friday" or "on Monday", worked out from the message date. "next Friday" or the same weekday stays loose.
export function weekdayDate(dueText: string | null, messageDate: string): string | null {
  if (!dueText) return null;
  const t = dueText.toLowerCase();
  if (/\bnext\b|\blast\b|\bor\b/.test(t)) return null;
  const hits = WEEKDAYS.filter((w) => new RegExp(`\\b${w}\\b`).test(t));
  if (hits.length !== 1) return null;
  const from = new Date(`${messageDate}T00:00:00Z`).getUTCDay();
  const ahead = (WEEKDAYS.indexOf(hits[0]) - from + 7) % 7;
  return ahead === 0 ? null : addDays(messageDate, ahead);
}

// The date of the message the quote sits in. A note has one date.
export function messageDateOf(doc: PreparedDoc, quote: string): string | null {
  if (doc.parsed.kind === "note") return doc.parsed.date;
  const q = norm(quote);
  const hit = doc.parsed.messages.find((m) => norm(m.body).includes(q));
  const dates = doc.parsed.messages.map((m) => m.date).filter((d): d is string => !!d);
  return hit?.date ?? dates[dates.length - 1] ?? null;
}

// Accept a name only if it is one of the six and the document holds it.
export function acceptOwner(name: string | null, team: Team, text: string): string | null {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0].toLowerCase();
  const hit = team.names.find((n) => n.toLowerCase() === first);
  if (!hit) return null;
  return new RegExp(`\\b${hit}\\b`, "i").test(text) ? hit : null;
}

function longestRun(a: string, b: string): number {
  let best = 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best) best = cur[j]; }
    }
    prev = cur;
  }
  return best;
}

// Two quotes point at the same passage when one holds the other, or they share one unbroken run
// of at least 20 characters that is at least half of the shorter quote. The same test the scorer uses.
export function samePassage(qa: string, qb: string): boolean {
  const a = norm(qa), b = norm(qb);
  if (a.length < 4 || b.length < 4) return false;
  if (a.includes(b) || b.includes(a)) return true;
  return longestRun(a, b) >= Math.max(20, Math.ceil(0.5 * Math.min(a.length, b.length)));
}

// Items in one document that quote the same passage are one thing owed. The kept type follows a fixed
// order, so the result does not depend on the order the model listed them in.
// A firm date the other one found still counts, because it comes from the same source words.
const TYPE_ORDER = ["reply_owed", "promise", "deadline", "come_back", "new_need"];
export interface MergedPair { keptType: string; droppedType: string; keptQuote: string; droppedQuote: string }
export function mergeSamePassage(items: ModelItem[]): { kept: ModelItem[]; merged: MergedPair[] } {
  const kept: ModelItem[] = [];
  const merged: MergedPair[] = [];
  const ordered = [...items].sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
  for (const it of ordered) {
    const twin = kept.find((k) => samePassage(k.quote, it.quote));
    if (!twin) { kept.push({ ...it }); continue; }
    if (!twin.due_date && it.due_date) { twin.due_date = it.due_date; twin.due_text = twin.due_text ?? it.due_text; }
    merged.push({ keptType: twin.type, droppedType: it.type, keptQuote: twin.quote, droppedQuote: it.quote });
  }
  return { kept, merged };
}

// An email reply owed must quote a message from outside AtliQ, never AtliQ's own words. Notes are left as the model
// read them. (Round 2 removed the rules that dropped answered or repeated asks: they removed real obligations.)
export function openReplies(items: ModelItem[], doc: PreparedDoc, team: Team): { kept: ModelItem[]; removed: { item: ModelItem; reason: string }[] } {
  if (doc.parsed.kind !== "email") return { kept: items, removed: [] };
  const msgs = doc.parsed.messages;
  const kept: ModelItem[] = [];
  const removed: { item: ModelItem; reason: string }[] = [];
  for (const it of items) {
    if (it.type !== "reply_owed") { kept.push(it); continue; }
    const k = msgs.findIndex((m) => norm(m.body).includes(norm(it.quote)));
    const m = msgs[k];
    if (!m?.from || isAtliqAddress(m.from.email, team)) { removed.push({ item: it, reason: "reply_owed_quotes_atliq" }); continue; }
    kept.push(it);
  }
  return { kept, removed };
}

export interface AccountPick {
  account: string;
  leadId: string | null;
  row: CrmRow | null;
  unclear: boolean;
  candidates: string[]; // two or more rows that fit the same company. Empty otherwise
}

// The row an item belongs to. One clear row, else needs review with no owner. Nothing is merged.
export function pickAccount(company: string, doc: PreparedDoc, crm: CrmRow[]): AccountPick {
  const accounts = doc.result.accounts;
  const rowOf = (id: string) => crm.find((r) => r.lead_id === id) ?? null;
  const named = accounts.filter((a) =>
    a.startsWith("NEW:") ? sameCompanyName(a.slice(4), company) : !!rowOf(a) && sameCompanyName(rowOf(a)!.company, company));
  const pool = named.length ? named : accounts.length === 1 ? accounts : [];
  if (pool.length === 1) {
    const a = pool[0];
    if (a.startsWith("NEW:")) return { account: a.slice(4), leadId: null, row: null, unclear: false, candidates: [] };
    const row = rowOf(a)!;
    return { account: row.company, leadId: row.lead_id, row, unclear: false, candidates: [] };
  }
  // Two or more rows fit the same company. No row is picked by any tie-break.
  const candidates = named.filter((a) => !a.startsWith("NEW:"));
  return { account: company, leadId: null, row: null, unclear: true, candidates: candidates.length > 1 ? candidates : [] };
}

export interface BuildContext {
  crm: CrmRow[];
  team: Team;
  referenceDate: string;
}

// Quote check first. What fails is dropped and logged, never shown.
export function checkQuotes(out: Call1Result, doc: PreparedDoc): { kept: ModelItem[]; dropped: Dropped[] } {
  const kept: ModelItem[] = [];
  const dropped: Dropped[] = [];
  for (const it of out.items) {
    if (quoteFoundIn(it.quote, doc.stripped)) kept.push(it);
    else dropped.push({ file: doc.file, kind: "item", quote: it.quote, reason: "quote_not_found" });
  }
  return { kept, dropped };
}

export function buildItems(kept: ModelItem[], doc: PreparedDoc, ctx: BuildContext): Item[] {
  const items: Item[] = [];
  const seen = new Set<string>();
  for (const it of kept) {
    const pick = pickAccount(it.company, doc, ctx.crm);
    const messageDate = messageDateOf(doc, it.quote) ?? ctx.referenceDate;
    // When rows are ambiguous, nothing is taken from either row. A name the source gives still stands.
    const ambiguous = pick.candidates.length > 1;
    const crmOwner = pick.row?.owner?.trim() || null;
    let owner: string | null = null;
    let ownerFrom: Item["owner_from"] = null;
    if (!pick.unclear || ambiguous) {
      const fromSource = it.type === "reply_owed" ? null : acceptOwner(it.owner, ctx.team, doc.stripped);
      if (fromSource) { owner = fromSource; ownerFrom = "source"; }
      else if (crmOwner) { owner = crmOwner; ownerFrom = "crm"; }
    }

    let dueDate: string | null = null;
    if (!it.needs_review) {
      if (it.due_date && dayMonthInText(it.due_date, doc.stripped)) dueDate = it.due_date;
      else dueDate = weekdayDate(it.due_text, messageDate);
    }
    const dueText = it.due_text?.trim() || null;

    let daysWaiting: number | null = null;
    if (it.type === "reply_owed") {
      const since = doc.result.last_external_message_from === "customer" && doc.result.last_external_message_date
        ? doc.result.last_external_message_date : messageDate;
      daysWaiting = daysBetween(since, ctx.referenceDate);
    }

    const needsReview = it.needs_review || (pick.unclear && !ambiguous);
    const id = stableId(doc.file, it.type, norm(it.quote));
    if (seen.has(id)) continue; // the same item twice in one answer counts once
    seen.add(id);
    items.push({
      id, file: doc.file, type: it.type, account: pick.account, lead_id: pick.leadId,
      summary: it.summary.trim(), quote: it.quote, message_date: messageDate,
      owner: owner ?? "no owner", owner_from: owner ? ownerFrom : null,
      due_date: dueDate, due_text: dueText, due_approx: !dueDate && !!dueText,
      days_waiting: daysWaiting, needs_review: needsReview, status: needsReview || ambiguous ? "needs review" : "new",
      ...(ambiguous ? { candidate_lead_ids: pick.candidates } : {}),
    });
  }
  return items;
}

// AtliQ's last line: the last line of its last message with some substance, word for word.
export function lastLine(m: Message): string | null {
  const lines = m.body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 20 && !/^(thanks|regards|best|cheers)\b/i.test(l));
  return lines[lines.length - 1] ?? null;
}

function rowsOfThread(doc: PreparedDoc, msg: Message, team: Team, crm: CrmRow[]): CrmRow[] {
  const ids = new Set<string>();
  for (const a of [...msg.to, ...msg.cc]) if (!isAtliqAddress(a.email, team)) (doc.match.addressRows[a.email] ?? []).forEach((r) => ids.add(r));
  if (!ids.size) doc.result.accounts.filter((a) => !a.startsWith("NEW:")).forEach((r) => ids.add(r));
  return crm.filter((r) => ids.has(r.lead_id));
}

// Nudge due, or gone quiet. AtliQ wrote last, it expects an answer, enough days have passed and no deal is Won or Lost.
export function followUps(doc: PreparedDoc, out: Call1Result, items: Item[], ctx: BuildContext, nudgeDays: number):
  { nudge: Item | null; quiet: GoneQuiet | null } {
  const none = { nudge: null, quiet: null };
  if (doc.parsed.kind !== "email" || doc.result.last_external_message_from !== "atliq" || !doc.last) return none;
  if (out.atliq_last_message_expects_answer !== true) return none;
  const msg = doc.last.message;
  const date = doc.last.date;
  if (!date) return none;
  const days = daysBetween(date, ctx.referenceDate);
  if (days < nudgeDays) return none;
  const rows = rowsOfThread(doc, msg, ctx.team, ctx.crm);
  const ambiguous = rows.length > 1;
  // A stage is row specific. With two rows in play neither stage is used, so neither blocks the nudge.
  if (!ambiguous && rows.some(isClosed)) return none;
  // If AtliQ's last message holds its own commitment, that item is raised and neither a nudge nor gone quiet.
  // The model may type the commitment as a promise, a deadline or a come-back, so any of them counts.
  if (items.some((i) => i.type !== "reply_owed" && i.type !== "new_need" && norm(msg.body).includes(norm(i.quote)))) return none;
  const quote = lastLine(msg);
  if (!quote || !quoteFoundIn(quote, doc.stripped)) return none;
  const row = rows.length === 1 ? rows[0] : null;
  const account = row?.company ?? doc.result.accounts.find((a) => a.startsWith("NEW:"))?.slice(4) ?? (doc.parsed as EmailDoc).titleCompany ?? "unknown";
  if (out.atliq_last_message_carries_proposal === true) {
    const sender = msg.from ? msg.from.name.split(/\s+/)[0] : "";
    const owner = ctx.team.names.find((n) => n.toLowerCase() === sender.toLowerCase()) ?? null;
    return {
      quiet: null,
      nudge: {
        id: stableId(doc.file, "nudge_due", norm(quote)), file: doc.file, type: "nudge_due", account, lead_id: row?.lead_id ?? null,
        summary: `Nudge ${account}. AtliQ sent a proposal ${days} days ago and got no reply.`, quote, message_date: date,
        owner: owner ?? "no owner", owner_from: owner ? "source" : null, due_date: null, due_text: null, due_approx: false,
        days_waiting: days, needs_review: false, status: ambiguous ? "needs review" : "new",
        ...(ambiguous ? { candidate_lead_ids: rows.map((r) => r.lead_id) } : {}),
      },
    };
  }
  if (out.atliq_last_message_carries_proposal === false) {
    return { nudge: null, quiet: { account, lead_id: row?.lead_id ?? null, file: doc.file, last_atliq_message_date: date, days_since: days, quote,
      ...(ambiguous ? { candidate_lead_ids: rows.map((r) => r.lead_id) } : {}) } };
  }
  return none;
}

