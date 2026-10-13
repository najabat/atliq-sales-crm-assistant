// Rules that code decides, never the model.
import type { CrmFlag, Item } from "./types.ts";
import type { CrmRow } from "./crm.ts";
import type { EmailDoc, Message, NoteDoc } from "./parse.ts";

export interface Team {
  names: string[]; // the six AtliQ first names
  domain: string; // atliq.com
}

export const isAtliqAddress = (email: string, team: Team): boolean =>
  email.toLowerCase().endsWith(`@${team.domain.toLowerCase()}`);

// ---------------------------------------------------------------- dates

const DAY = 86_400_000;
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- messages

const AUTO_REPLY = /^(automatic reply|auto[- ]?reply|autoreply|out of (the )?office)\b/i;
export function isAutoReply(m: Message): boolean {
  return AUTO_REPLY.test(m.body.trim()) || AUTO_REPLY.test((m.subject ?? "").trim());
}

// A message between two AtliQ addresses is internal. It is not a reply to the customer.
export function isInternalMessage(m: Message, team: Team): boolean {
  const all = [m.from, ...m.to, ...m.cc].filter((a): a is NonNullable<typeof a> => !!a);
  return all.length > 0 && all.every((a) => isAtliqAddress(a.email, team));
}

export const isExternalMessage = (m: Message, team: Team): boolean => !isAutoReply(m) && !isInternalMessage(m, team);

export interface LastWriter {
  from: "customer" | "atliq";
  date: string | null;
  message: Message;
}

// Who wrote last. The last message that is not an automatic reply and not between two AtliQ addresses.
export function whoWroteLast(doc: EmailDoc, team: Team): LastWriter | null {
  const ext = doc.messages.filter((m) => m.from && isExternalMessage(m, team));
  const last = ext[ext.length - 1];
  if (!last || !last.from) return null;
  return { from: isAtliqAddress(last.from.email, team) ? "atliq" : "customer", date: last.date, message: last };
}

// True when no customer is on the document.
export function isInternalEmail(doc: EmailDoc, team: Team): boolean {
  return doc.messages.every((m) => [m.from, ...m.to, ...m.cc].every((a) => !a || isAtliqAddress(a.email, team)));
}

// ---------------------------------------------------------------- notes

const CONTACT_WORDS = /\b(call|calls|demo|meeting|review|discovery|negotiation|visit|qbr|lunch|intro|workshop)\b|summit|conference|expo|booth/i;
const isTeamName = (s: string, team: Team): boolean =>
  team.names.some((n) => s.trim().toLowerCase().split(/\s+/)[0] === n.toLowerCase());

// A note is internal when it says so, when every attendee is from AtliQ, or when it lists no attendees
// and its title names no contact with a customer, such as a call, demo or meeting.
export function isInternalNote(note: NoteDoc, team: Team): boolean {
  if (/\binternal\b/i.test(note.title)) return true;
  if (note.attendees && note.attendees.length) return note.attendees.every((a) => isTeamName(a, team));
  return !CONTACT_WORDS.test(note.title);
}

// ---------------------------------------------------------------- last contact date

export interface ContactEvidence {
  leadId: string;
  date: string;
  file: string;
  shared?: string[]; // the source fits two or more rows. The date still counts for each of them
}

// The latest message with the customer in either direction, or the latest call note.
// Automatic replies and internal emails do not count.
export function contactEvidence(
  doc: EmailDoc | NoteDoc,
  noteContactRows: string[],
  addressRows: Record<string, string[]>,
  team: Team,
): ContactEvidence[] {
  const out: ContactEvidence[] = [];
  const rows = noteContactRows.filter((a) => !a.startsWith("NEW:"));
  if (doc.kind === "note") {
    const shared = rows.length > 1 ? rows : undefined;
    if (!isInternalNote(doc, team) && doc.date) for (const leadId of rows) out.push({ leadId, date: doc.date, file: doc.file, shared });
    return out;
  }
  for (const m of doc.messages) {
    if (!m.date || !isExternalMessage(m, team)) continue;
    for (const a of [m.from, ...m.to, ...m.cc]) {
      if (!a || isAtliqAddress(a.email, team)) continue;
      const rowsHere = addressRows[a.email] ?? [];
      const shared = rowsHere.length > 1 ? rowsHere : undefined;
      for (const leadId of rowsHere) out.push({ leadId, date: m.date, file: doc.file, shared });
    }
  }
  return out;
}

export function latestContact(evidence: ContactEvidence[]): Map<string, ContactEvidence> {
  const best = new Map<string, ContactEvidence>();
  for (const e of evidence) {
    const cur = best.get(e.leadId);
    if (!cur || e.date > cur.date) best.set(e.leadId, e);
  }
  return best;
}

// Propose a new last contact date only when it is later than the CRM value or the CRM value is blank.
export const shouldProposeContact = (crmValue: string, found: string): boolean => !crmValue || found > crmValue;

// ---------------------------------------------------------------- CRM flags

export function noOwnerFlags(crm: CrmRow[]): CrmFlag[] {
  return crm.filter((r) => !r.owner.trim()).map((r) => ({
    kind: "no_owner", lead_ids: [r.lead_id], company: r.company, file: null, quote: null,
    note: "This row has no owner. Pick one of the four sellers.",
  }));
}

const PUBLIC_MAIL = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me", "live.com"]);

// Two rows that share a contact email, or a company email domain, may be one company. Flag them. Never merge.
export function doubleEntryFlags(crm: CrmRow[]): CrmFlag[] {
  const flags: CrmFlag[] = [];
  for (let i = 0; i < crm.length; i++) {
    for (let j = i + 1; j < crm.length; j++) {
      const a = crm[i], b = crm[j];
      const ea = a.contact_email.toLowerCase(), eb = b.contact_email.toLowerCase();
      if (!ea || !eb) continue;
      const da = ea.split("@")[1], db = eb.split("@")[1];
      let why = "";
      if (ea === eb) why = "They share the same contact email.";
      else if (da === db && !PUBLIC_MAIL.has(da)) why = "Their contacts share the same company email domain.";
      if (why) flags.push({
        kind: "double_entry", lead_ids: [a.lead_id, b.lead_id], company: a.company, file: null, quote: null,
        note: `Possible double entry. ${why} A person decides if they are one company or two deals.`,
      });
    }
  }
  return flags;
}

// ---------------------------------------------------------------- next step date and overdue (D17)

const isFirm = (i: Item): boolean => !!i.due_date && !i.due_approx;

// The nearest firm due date on or after the reference date among the account's open items.
// A loose date sets nothing. If every firm date has passed, the account is overdue and no date is set.
export function nextStep(openItems: Item[], referenceDate: string): { date: string | null; overdue: boolean } {
  const firm = openItems.filter(isFirm).map((i) => i.due_date as string);
  if (!firm.length) return { date: null, overdue: false };
  const ahead = firm.filter((d) => d >= referenceDate).sort();
  return ahead.length ? { date: ahead[0], overdue: false } : { date: null, overdue: true };
}

// ---------------------------------------------------------------- come-back

// When a customer asks for a week, come back on day 7 plus the buffer. A stated date always wins.
export function comeBackDate(messageDate: string, bufferDays: number, statedDate: string | null = null): string {
  return statedDate ?? addDays(messageDate, 7 + bufferDays);
}

// ---------------------------------------------------------------- order

// Overdue first, then the nearest due date, then the longest wait.
export function orderItems(items: Item[], referenceDate: string): Item[] {
  const rank = (i: Item): [number, string, number] => {
    const overdue = isFirm(i) && (i.due_date as string) < referenceDate;
    return [overdue ? 0 : i.due_date ? 1 : 2, i.due_date ?? "9999-99-99", -(i.days_waiting ?? -1)];
  };
  return [...items].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    return ra[0] - rb[0] || ra[1].localeCompare(rb[1]) || ra[2] - rb[2];
  });
}
