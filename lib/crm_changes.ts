// Turns call 2 output into CRM changes and flags. Code checks every one. Nothing is saved until a person approves.
import { CRM_COLUMNS, STAGES, type CrmRow } from "./crm.ts";
import { stableId, type PreparedDoc } from "./pipeline.ts";
import type { Call2Result } from "./prompts/call2.ts";
import { isAtliqAddress, nextStep } from "./rules.ts";
import { norm, quoteFoundIn } from "./text.ts";
import type { CrmChange, CrmFlag, Dropped, Item, NewRow } from "./types.ts";

// cr5.1 is version 3.1: "3.1 fixed a word list bug in the new-row source rule, found after round 3 scoring."
// It is the one documented exception to the round 3 freeze. Nothing else changed.
export const CRM_RULES_VERSION = "cr5.1";

// A new row's source only when the document says in words how the lead came in. General words per source value.
const SOURCE_WORDS: Record<string, RegExp> = {
  // 3.1: an introduction subject such as "Intro:" is a stated referral cue.
  Referral: /\b(referr(al|ed)|introduc(ed|tion|ing)|recommended (you|us))\b|\bintro\s*:/i,
  LinkedIn: /\blinkedin\b/i,
  // 3.1: conference words also match inside a compound name, such as an event called "[Name]Summit".
  Conference: /(conference|summit|expo|trade ?show|booth)/i,
  Website: /\b(website|web site|contact form|web form|found (you|us) online)\b/i,
  "Cold Outreach": /\b(cold (email|call|outreach)|reached out to (you|them) first)\b/i,
};
export const sourceStated = (source: string, text: string): boolean => SOURCE_WORDS[source]?.test(text) ?? false;

// Closures need strong evidence: words of completion, not a question, and the same subject as the item.
const COMPLETION = /\b(attached|attaching|sent|sending|here is|here's|shared|delivered|completed|done|showed|demoed|held|answered|replied|signed|cancel+ed|no longer|instead|replaced|withdrawn|resolved|confirmed)\b/i;
const STOP = new Set(["about", "after", "again", "their", "there", "these", "those", "which", "would", "could", "should", "where", "while", "with", "from", "that", "this", "what", "when", "will", "have", "your", "into", "than", "them", "they", "need", "want"]);
const stems = (s: string) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 5)));
export function strongClosure(itemQuote: string, evidence: string): boolean {
  if (/\?/.test(evidence) || !COMPLETION.test(evidence)) return false;
  const a = stems(itemQuote);
  return [...stems(evidence)].some((w) => a.has(w));
}

// The documents call 2 sees for a row: clear matches only, customer documents first, then the newest. At most `max`.
export function docsForRow(rowId: string, docs: PreparedDoc[], items: Item[], max: number): PreparedDoc[] {
  const clear = docs.filter((d) => d.result.accounts.includes(rowId) && !d.match.ambiguousRows.includes(rowId));
  const withItems = new Set(items.filter((i) => i.lead_id === rowId).map((i) => i.file));
  const dateOf = (d: PreparedDoc) => (d.parsed.kind === "note" ? d.parsed.date : d.parsed.messages.map((m) => m.date).filter(Boolean).pop()) ?? "";
  return [...clear].sort((a, b) =>
    Number(a.result.internal) - Number(b.result.internal) ||
    Number(withItems.has(b.file)) - Number(withItems.has(a.file)) ||
    dateOf(b).localeCompare(dateOf(a))).slice(0, max);
}

export function call2User(row: CrmRow | null, newName: string | null, items: Item[], docs: PreparedDoc[], referenceDate: string): string {
  const rowText = row
    ? CRM_COLUMNS.map((c) => `${c}: ${row[c] || "(blank)"}`).join("\n")
    : `NEW company: ${newName}. It has no CRM row.`;
  const itemText = items.length
    ? items.map((i, n) => `${n + 1}. ${i.type} | ${i.summary} | "${i.quote}" | ${i.message_date} | ${i.file}`).join("\n")
    : "(none)";
  const docText = docs.map((d) => `<document file="${d.file}">\n${d.stripped.trim()}\n</document>`).join("\n");
  return `Reference date: ${referenceDate}.\n<row>\n${rowText}\n</row>\n<items>\n${itemText}\n</items>\n${docText}`;
}

const CLAIMS = /\b(signed|paid|won|lost|terminated|executed|invoiced|closed)\b/gi;
const MONEY = /(?:\$|usd\s*)?\d[\d,.]*\s*(?:k|m|usd|dollars)\b|\$\s*\d[\d,.]*/gi;

// A notes line may not claim an outcome or a money figure the source does not hold.
export function notesSupported(line: string, sourceText: string): boolean {
  const src = norm(sourceText);
  for (const w of line.match(CLAIMS) ?? []) if (!new RegExp(`\\b${w.toLowerCase()}\\b`).test(src)) return false;
  for (const m of line.match(MONEY) ?? []) {
    const digits = m.replace(/[^\d.]/g, "");
    if (digits && !src.replace(/,/g, "").includes(digits.replace(/,/g, ""))) return false;
  }
  // A figure written with a currency sign must appear in the source in that same written form.
  for (const m of norm(line).match(/(?:\$|usd\s*)(?:[\d,.]+)(?:\s*(?:million|billion|m|k))?/g) ?? []) if (!src.includes(m)) return false;
  return true;
}

// One stated figure, in whole dollars. A range, two figures or a figure the quote does not hold is refused.
export function statedValue(proposed: string, quote: string): string | null {
  const q = quote.toLowerCase();
  if (/\d\s*(?:–|—|-|to)\s*\$?\d/.test(q) || /\bbetween\b/.test(q)) return null;
  const figures = q.match(/\$?\s*\d[\d,]*(?:\.\d+)?\s*(?:k|m)?\b/g)?.filter((f) => /\d{2,}|k|m/.test(f)) ?? [];
  if (figures.length !== 1) return null;
  const f = figures[0].replace(/[\s$,]/g, "");
  const n = f.endsWith("k") ? parseFloat(f) * 1000 : f.endsWith("m") ? parseFloat(f) * 1_000_000 : parseFloat(f);
  const p = parseFloat(proposed.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n !== p) return null;
  return String(Math.round(n));
}

export interface Call2Context {
  sellers: string[];
  sources: string[];
  services: string[]; // the service lines already used in the CRM export
  domain: string; // AtliQ's email domain, to tell a customer-written message from AtliQ's own
}

const OPEN_RANK: Record<string, number> = { "": -1, New: 0, Contacted: 1, "Proposal Sent": 2 };

// Where a quote sits: who wrote it and when. A customer note is a call or meeting note that is not internal.
export function quoteSource(quote: string, file: string, docs: PreparedDoc[], domain: string): { byCustomer: boolean; date: string | null } | null {
  const d = docs.find((x) => x.file === file);
  if (!d) return null;
  if (d.parsed.kind === "note") return { byCustomer: !d.result.internal, date: d.parsed.date };
  const m = d.parsed.messages.find((x) => norm(x.body).includes(norm(quote)));
  if (!m?.from) return null;
  return { byCustomer: !isAtliqAddress(m.from.email, { names: [], domain }), date: m.date };
}

// Stage rules. Open stages move forward only. Won never moves back. Lost may reopen to Contacted only on a later
// customer-written message or customer call note. Anything else is no stage change: "conflict" shows both sides.
export function stageDecision(current: string, proposed: string, quote: string, file: string, docs: PreparedDoc[], row: CrmRow, domain: string):
  "ok" | "conflict" | "reject" {
  if (current === proposed) return "reject";
  if (current === "Won") return "reject";
  if (current === "Lost") {
    if (proposed !== "Contacted") return "conflict";
    const src = quoteSource(quote, file, docs, domain);
    const later = !!src?.date && (!row.last_contact_date || src.date > row.last_contact_date);
    return src?.byCustomer && later ? "ok" : "conflict";
  }
  // Won only when the quote says signed, paid or won in words. An approval without a signature is a conflict.
  if (proposed === "Won") return /\b(signed|paid|won)\b/i.test(quote) ? "ok" : "conflict";
  if (proposed === "Lost") return "ok";
  return (OPEN_RANK[proposed] ?? -1) > (OPEN_RANK[current] ?? -1) ? "ok" : "conflict";
}

// A contact name the source itself marks as uncertain, such as "Name?", is not stated.
export function nameMarkedUncertain(name: string, text: string): boolean {
  const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, (ch) => `\\${ch}`);
  return name.split(/\s+/).filter((w) => w.length > 1).some((w) => new RegExp(`\\b${escape(w)}\\s*\\?`, "i").test(text));
}

// Items a later document shows as done, answered, cancelled or superseded. Code checks the quote, the account and
// that the evidence is dated after the item. A closed item stays listed but sets no next step date and no overdue flag.
export interface Closure { id: string; itemQuote: string; itemDate: string; evidence: string; file: string; evidenceDate: string }
export function closedItems(out: Call2Result, rowItems: Item[], docs: PreparedDoc[], domain: string): { ids: string[]; dropped: Dropped[]; closures: Closure[] } {
  const ids: string[] = [];
  const dropped: Dropped[] = [];
  const closures: Closure[] = [];
  for (const c of out.closed_items ?? []) {
    const item = rowItems[c.item - 1];
    const d = docs.find((x) => x.file === c.file);
    if (!item || !d || !quoteFoundIn(c.quote, d.stripped)) { dropped.push({ file: c.file, kind: "crm_change", quote: c.quote, reason: "closure_quote_not_found" }); continue; }
    if (!strongClosure(item.quote, c.quote)) { dropped.push({ file: c.file, kind: "crm_change", quote: c.quote, reason: "closure_too_weak" }); continue; }
    const src = quoteSource(c.quote, c.file, docs, domain);
    if (!src?.date || src.date <= item.message_date) { dropped.push({ file: c.file, kind: "crm_change", quote: c.quote, reason: "closure_not_later" }); continue; }
    ids.push(item.id);
    closures.push({ id: item.id, itemQuote: item.quote, itemDate: item.message_date, evidence: c.quote, file: c.file, evidenceDate: src.date });
  }
  return { ids, dropped, closures };
}

const OWNERSHIP = /\b(owns?|owner|on me|takes? (it|this|the deal|over)|will (lead|handle|own)|assigned)\b/i;

export function buildCrmChanges(
  out: Call2Result, row: CrmRow | null, newName: string | null, docs: PreparedDoc[], ctx: Call2Context,
): { changes: CrmChange[]; flags: CrmFlag[]; dropped: Dropped[] } {
  const changes: CrmChange[] = [];
  const flags: CrmFlag[] = [];
  const dropped: Dropped[] = [];
  const docOf = (file: string) => docs.find((d) => d.file === file);
  const grounded = (quote: string, file: string) => { const d = docOf(file); return !!d && quoteFoundIn(quote, d.stripped); };
  const drop = (file: string, quote: string, reason: string) => dropped.push({ file, kind: "crm_change", quote, reason });
  const company = row?.company ?? newName ?? "";

  if (row) {
    const seen = new Set<string>();
    for (const c of out.changes) {
      if (!grounded(c.quote, c.file)) { drop(c.file, c.quote, "quote_not_found"); continue; }
      if (seen.has(c.field)) continue; // one change per field
      const raw = c.proposed.trim();
      let proposed: string | null = raw;
      if (c.field === "status") {
        proposed = (STAGES as readonly string[]).find((s) => s.toLowerCase() === raw.toLowerCase()) ?? null;
        if (proposed) {
          const decision = stageDecision(row.status, proposed, c.quote, c.file, docs, row, ctx.domain);
          if (decision !== "ok") {
            if (decision === "conflict") flags.push({ kind: "conflict", lead_ids: [row.lead_id], company, file: c.file, quote: c.quote,
              note: `CRM: ${row.status || "blank"}. Evidence points elsewhere. No stage change is proposed. A person decides.` });
            drop(c.file, c.quote, "stage_rule");
            continue;
          }
        }
      }
      if (c.field === "est_value_usd") proposed = statedValue(raw, c.quote);
      if (c.field === "owner") {
        const name = ctx.sellers.find((s) => s.toLowerCase() === raw.toLowerCase());
        proposed = name && new RegExp(`\\b${name}\\b`, "i").test(c.quote) && OWNERSHIP.test(c.quote) ? name : null;
      }
      if (c.field === "notes" && !notesSupported(raw, docOf(c.file)!.stripped)) proposed = null;
      // A service interest fills a blank field only. A value a seller entered is not overwritten on a guess.
      if (c.field === "service_interest") {
        // Never from a document marked unclear or needs review, and never over a value a seller entered.
        const unclear = docOf(c.file)?.result.needs_review === true;
        proposed = row.service_interest || unclear ? null : ctx.services.find((s) => s.toLowerCase() === raw.toLowerCase()) ?? null;
      }
      if (!proposed) { drop(c.file, c.quote, `unsupported_${c.field}`); continue; }
      if (c.field !== "notes" && norm(proposed) === norm(row[c.field as keyof CrmRow])) continue;
      seen.add(c.field);
      changes.push({
        id: stableId(row.lead_id, c.field, norm(c.quote)), lead_id: row.lead_id, company, field: c.field,
        current: row[c.field as keyof CrmRow] || null, proposed, quote: c.quote, file: c.file, set_by: "model", status: "proposed",
      });
    }
    for (const k of out.conflicts) {
      if (!grounded(k.quote, k.file)) { drop(k.file, k.quote, "quote_not_found"); continue; }
      flags.push({ kind: "conflict", lead_ids: [row.lead_id], company, file: k.file, quote: k.quote,
        note: `CRM: ${k.crm_says.trim()} Evidence: ${k.evidence_says.trim()}` });
    }
  } else if (out.new_row) {
    // A new CRM row fills only company, contact name, contact email and source.
    const n = out.new_row;
    if (!grounded(n.quote, n.file)) drop(n.file, n.quote, "quote_not_found");
    else {
      const text = norm(docs.map((d) => d.stripped).join("\n"));
      const raw = docs.map((d) => d.stripped).join("\n");
      const stated = (v: string | null) => (v && text.includes(norm(v)) ? v.trim() : null);
      const proposed: NewRow = {
        company: newName,
        contact_name: n.contact_name && !nameMarkedUncertain(n.contact_name, raw) ? stated(n.contact_name) : null,
        contact_email: stated(n.contact_email),
        source: n.source && ctx.sources.includes(n.source) && sourceStated(n.source, raw) ? n.source : null,
      };
      changes.push({ id: stableId(`NEW:${newName}`, "new_row", norm(n.quote)), lead_id: null, company: newName ?? "", field: "new_row",
        current: null, proposed, quote: n.quote, file: n.file, set_by: "model", status: "proposed" });
    }
  }
  return { changes, flags, dropped };
}

// Code sets the next step date from the items (D17). A row whose firm dates have all passed gets an overdue flag.
export function nextStepChanges(crm: CrmRow[], items: Item[], referenceDate: string): { changes: CrmChange[]; flags: CrmFlag[] } {
  const changes: CrmChange[] = [];
  const flags: CrmFlag[] = [];
  for (const row of crm) {
    const open = items.filter((i) => i.lead_id === row.lead_id);
    const r = nextStep(open, referenceDate);
    if (r.date && r.date !== row.next_followup_date) {
      const src = open.find((i) => i.due_date === r.date && !i.due_approx)!;
      changes.push({ id: stableId(row.lead_id, "next_followup_date", r.date), lead_id: row.lead_id, company: row.company,
        field: "next_followup_date", current: row.next_followup_date || null, proposed: r.date, quote: null, file: src.file,
        set_by: "rule", status: "proposed" });
    }
    if (r.overdue) {
      const late = open.filter((i) => i.due_date && !i.due_approx);
      flags.push({ kind: "overdue", lead_ids: [row.lead_id], company: row.company, file: late[0]?.file ?? null, quote: late[0]?.quote ?? null,
        note: `Every firm date on this account has passed (${late.map((i) => i.due_date).join(", ")}). No next step date is set.` });
    }
  }
  return { changes, flags };
}

