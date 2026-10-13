// Matches a document to CRM rows. By lead ID in the text, then by contact email, then by company name.
// A document may belong to more than one row. Nothing is ever merged.
import type { CrmRow } from "./crm.ts";
import type { EmailDoc, NoteDoc, ParsedDoc } from "./parse.ts";
import { isAtliqAddress, isInternalNote, type Team } from "./rules.ts";

export interface MatchResult {
  accounts: string[]; // lead IDs, or NEW:<name> for a company with no CRM row
  unclear: boolean; // one name or address fits more than one row
  addressRows: Record<string, string[]>; // external address -> the rows it speaks for
  contactRows: string[]; // for a note, the rows the meeting was with. Other rows it mentions are not contact
  ambiguousRows: string[]; // rows of this document that share a name or a contact and cannot be told apart
}

// Words that say nothing about which company it is.
const LEGAL = new Set(["ltd", "llc", "inc", "pvt", "private", "limited", "co", "corp", "corporation", "group", "the", "plc", "gmbh"]);
const GENERIC = new Set(["global", "data", "smart", "green", "cloud", "fresh", "retail", "travel", "urban", "steel",
  "pixel", "cargo", "clear", "health", "ocean", "shop", "volt", "blue", "north", "city", "first", "new", "best", "prime",
  "united", "national", "general", "royal", "star", "sun", "tech", "digital", "solutions", "services", "systems"]);
const NOTE_WORDS = new Set(["meeting", "meetings", "notes", "note", "call", "calls", "intro", "demo", "pricing", "discovery",
  "review", "quarterly", "status", "internal", "debrief", "informal", "check", "budget", "negotiation", "scribble",
  "round", "w", "with", "and", "summary", "follow", "up", "followup", "kickoff", "qbr", "sync"]);
const PUBLIC_MAIL = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me", "live.com"]);

export function nameTokens(name: string): string[] {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(" ")
    .filter((t) => t && !LEGAL.has(t));
}

// The words that identify a company: its full name, its name run together and a distinctive first word.
function namePatterns(company: string): string[] {
  const t = nameTokens(company);
  if (!t.length) return [];
  const out = new Set([t.join(" "), t.join("")]);
  if (t[0].length >= 4 && !GENERIC.has(t[0])) out.add(t[0]);
  return [...out];
}

function containsPhrase(haystackTokens: string[], phrase: string): boolean {
  const p = phrase.split(" ");
  for (let i = 0; i + p.length <= haystackTokens.length; i++) {
    if (p.every((w, j) => haystackTokens[i + j] === w)) return true;
  }
  return false;
}

export function rowsNamedIn(text: string, crm: CrmRow[]): string[] {
  const tokens = text.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(" ");
  return crm.filter((r) => namePatterns(r.company).some((p) => containsPhrase(tokens, p))).map((r) => r.lead_id);
}

export function sameCompanyName(a: string, b: string): boolean {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join("") === tb.join("")) return true;
  return ta[0] === tb[0] && ta[0].length >= 4 && !GENERIC.has(ta[0]);
}

export const domainOf = (email: string): string => email.split("@")[1] ?? "";

export function rowsForAddress(email: string, crm: CrmRow[]): string[] {
  const exact = crm.filter((r) => r.contact_email && r.contact_email.toLowerCase() === email).map((r) => r.lead_id);
  if (exact.length) return exact;
  const d = domainOf(email);
  if (!d || PUBLIC_MAIL.has(d)) return [];
  return crm.filter((r) => r.contact_email && domainOf(r.contact_email.toLowerCase()) === d).map((r) => r.lead_id);
}

const leadIdsIn = (text: string, crm: CrmRow[]): string[] => {
  const ids = new Set(crm.map((r) => r.lead_id));
  return [...new Set(text.match(/\bL-\d{3,5}\b/g) ?? [])].filter((id) => ids.has(id));
};

// A company name from a note title such as "Some Co — call notes 3 Jun (Name)".
export function companyFromNoteTitle(title: string, team: Team): string | null {
  const people = new Set(team.names.map((n) => n.toLowerCase()));
  const segments = title.replace(/\(.*?\)/g, " ").split(/\s[—–-]\s|,|:/);
  for (const seg of segments) {
    const words = seg
      .replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\b|\b\d{1,2}\s+[A-Za-z]{3,9}\b/g, " ")
      .replace(/[?!.#*]/g, " ")
      .split(/\s+/)
      .filter((w) => w && !NOTE_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, "")) && !people.has(w.toLowerCase()));
    const caps = words.filter((w) => /^[A-Z0-9&]/.test(w));
    if (caps.length) return caps.join(" ").trim();
  }
  return null;
}

function resolveName(name: string, crm: CrmRow[]): string[] {
  return crm.filter((r) => sameCompanyName(r.company, name)).map((r) => r.lead_id);
}

function matchEmail(doc: EmailDoc, text: string, crm: CrmRow[], team: Team): MatchResult {
  const accounts = new Set<string>(leadIdsIn(text, crm));
  const addressRows: Record<string, string[]> = {};
  let unclear = false;
  const unmatched: string[] = [];
  for (const m of doc.messages) {
    for (const a of [m.from, ...m.to, ...m.cc]) {
      if (!a || isAtliqAddress(a.email, team) || a.email in addressRows) continue;
      const rows = rowsForAddress(a.email, crm);
      addressRows[a.email] = rows;
      if (rows.length > 1) unclear = true;
      if (rows.length) rows.forEach((r) => accounts.add(r));
      else unmatched.push(a.email);
    }
  }
  // An outside address with no CRM row, or a thread with no outside address, falls back to the title.
  if ((unmatched.length || accounts.size === 0) && doc.titleCompany) {
    const byName = resolveName(doc.titleCompany, crm).filter((id) => !accounts.has(id));
    const alreadyNamed = [...accounts].some((id) => sameCompanyName(crm.find((r) => r.lead_id === id)!.company, doc.titleCompany!));
    if (byName.length) {
      if (byName.length > 1) unclear = true;
      byName.forEach((r) => accounts.add(r));
      for (const e of unmatched) addressRows[e] = byName;
    } else if (!alreadyNamed) {
      accounts.add(`NEW:${doc.titleCompany}`);
    }
  }
  return { accounts: [...accounts], unclear, addressRows, contactRows: [], ambiguousRows: ambiguousRowsOf([...accounts], crm) };
}

// When the text names one row of a same-name pair by its lead ID, a name mention points to that row,
// not to its twin.
function dropTwinsOfNamedIds(named: string[], ids: string[], crm: CrmRow[]): string[] {
  const rowOf = (id: string) => crm.find((r) => r.lead_id === id)!;
  return named.filter((n) => ids.includes(n) || !ids.some((i) => i !== n && sameCompanyName(rowOf(i).company, rowOf(n).company)));
}

// Rows in one document that share a company name or a contact email cannot be told apart by the document.
export function ambiguousRowsOf(accounts: string[], crm: CrmRow[]): string[] {
  const rows = accounts.filter((a) => !a.startsWith("NEW:")).map((id) => crm.find((r) => r.lead_id === id)!).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    const sameMail = !!a.contact_email && a.contact_email.toLowerCase() === b.contact_email.toLowerCase();
    if (sameMail || sameCompanyName(a.company, b.company)) { out.add(a.lead_id); out.add(b.lead_id); }
  }
  return [...out];
}

function matchNote(doc: NoteDoc, text: string, crm: CrmRow[], team: Team): MatchResult {
  const accounts = new Set<string>(leadIdsIn(text, crm));
  let unclear = false;
  let contactRows: string[] = [];
  for (const e of text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []) {
    if (!isAtliqAddress(e.toLowerCase(), team)) rowsForAddress(e.toLowerCase(), crm).forEach((r) => accounts.add(r));
  }
  if (isInternalNote(doc, team)) {
    // An internal note belongs to every account it names.
    const ids = [...accounts];
    dropTwinsOfNamedIds(rowsNamedIn(text, crm), ids, crm).forEach((r) => accounts.add(r));
  } else {
    // A customer note belongs to the company in its title.
    const named = dropTwinsOfNamedIds(rowsNamedIn(doc.title, crm), [...accounts], crm);
    if (named.length > 1 && !named.every((id) => accounts.has(id))) unclear = true;
    named.forEach((r) => accounts.add(r));
    // The meeting was with the company in the title. A row the note only mentions, such as a referral, is not contact.
    contactRows = named.length ? named : [...accounts];
    if (accounts.size === 0) {
      const name = companyFromNoteTitle(doc.title, team);
      if (name) accounts.add(`NEW:${name}`);
      else unclear = true;
    }
  }
  return { accounts: [...accounts], unclear, addressRows: {}, contactRows, ambiguousRows: ambiguousRowsOf([...accounts], crm) };
}

export function matchDocument(doc: ParsedDoc, strippedText: string, crm: CrmRow[], team: Team): MatchResult {
  return doc.kind === "email" ? matchEmail(doc, strippedText, crm, team) : matchNote(doc, strippedText, crm, team);
}
