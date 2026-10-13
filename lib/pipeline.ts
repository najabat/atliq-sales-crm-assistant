// The steps that need no model, shared by the batch run and Quick capture.
// 1 parse  2 strip notes  3 match account  6 rules.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CrmRow } from "./crm.ts";
import { matchDocument, type MatchResult } from "./match.ts";
import { parseDoc, type ParsedDoc } from "./parse.ts";
import {
  contactEvidence, doubleEntryFlags, isInternalEmail, isInternalNote, latestContact, noOwnerFlags,
  daysBetween, shouldProposeContact, whoWroteLast, type ContactEvidence, type LastWriter, type Team,
} from "./rules.ts";
import { modelInput } from "./text.ts";
import type { CrmChange, CrmFlag, DocumentResult, WaitingCustomer } from "./types.ts";

export interface PreparedDoc {
  file: string;
  stripped: string;
  parsed: ParsedDoc;
  match: MatchResult;
  result: DocumentResult;
  evidence: ContactEvidence[];
  last: LastWriter | null;
}

export const stableId = (...parts: string[]): string =>
  createHash("sha1").update(parts.join("␟")).digest("hex").slice(0, 16);

export function listDataset(datasetDir: string): string[] {
  const out: string[] = [];
  for (const folder of ["emails", "meeting_notes"]) {
    for (const f of fs.readdirSync(path.join(datasetDir, folder)).filter((f) => f.endsWith(".md")).sort()) out.push(`${folder}/${f}`);
  }
  return out;
}

export function prepareDocument(file: string, raw: string, crm: CrmRow[], team: Team): PreparedDoc {
  const stripped = modelInput(raw, file);
  const parsed = parseDoc(stripped, file);
  const match = matchDocument(parsed, stripped, crm, team);
  const last = parsed.kind === "email" ? whoWroteLast(parsed, team) : null;
  const internal = parsed.kind === "email" ? isInternalEmail(parsed, team) : isInternalNote(parsed, team);
  const result: DocumentResult = {
    file,
    accounts: match.accounts,
    internal,
    last_external_message_from: last ? last.from : null,
    last_external_message_date: last ? last.date : null,
    customer_last_message_asks: null,
    atliq_last_message_expects_answer: null,
    atliq_last_message_carries_proposal: null,
    needs_review: false,
    instruction_flagged: false,
    status: "ok",
  };
  return { file, stripped, parsed, match, result, evidence: contactEvidence(parsed, match.contactRows, match.addressRows, team), last };
}

// Code sets last_contact_date. next_followup_date needs owed items, so it arrives with the model run.
export function ruleChanges(docs: PreparedDoc[], crm: CrmRow[]): CrmChange[] {
  const latest = latestContact(docs.flatMap((d) => d.evidence));
  const changes: CrmChange[] = [];
  for (const row of crm) {
    const found = latest.get(row.lead_id);
    if (!found || !shouldProposeContact(row.last_contact_date, found.date)) continue;
    changes.push({
      id: stableId(row.lead_id, "last_contact_date", found.date),
      lead_id: row.lead_id, company: row.company, field: "last_contact_date",
      current: row.last_contact_date || null, proposed: found.date, quote: null, file: found.file,
      set_by: "rule", status: "proposed",
      ...(found.shared ? { candidate_lead_ids: [...found.shared].sort() } : {}),
    });
  }
  return changes;
}

export function ruleFlags(docs: PreparedDoc[], crm: CrmRow[]): CrmFlag[] {
  const missing = new Map<string, PreparedDoc>();
  for (const d of docs) for (const a of d.result.accounts) if (a.startsWith("NEW:") && !missing.has(a)) missing.set(a, d);
  const missingFlags: CrmFlag[] = [...missing].map(([a, d]) => {
    const company = a.slice(4);
    const inText = d.stripped.toLowerCase().includes(company.toLowerCase());
    return {
      kind: "missing_company", lead_ids: [], company, file: d.file, quote: inText ? company : null,
      note: "This company is not in the CRM. A new row can be added once a person approves it.",
    };
  });
  return [...noOwnerFlags(crm), ...doubleEntryFlags(crm), ...missingFlags];
}

// Customers who wrote last. Credited to the row of the person who wrote, one entry per customer,
// keeping the thread with the customer's latest message. `asks` filters out messages that ask for nothing.
// The rules-only run has no model flag yet, so it passes every thread.
export function waitingCustomers(
  docs: PreparedDoc[], crm: CrmRow[], referenceDate: string,
  asks: (d: PreparedDoc) => boolean = () => true,
): WaitingCustomer[] {
  const best = new Map<string, WaitingCustomer>();
  for (const d of docs) {
    if (!d.last || d.last.from !== "customer" || !d.last.date || !d.last.message.from || !asks(d)) continue;
    const sender = d.last.message.from.email;
    let rows = d.match.addressRows[sender] ?? [];
    if (!rows.length) rows = d.result.accounts.filter((a) => a.startsWith("NEW:"));
    if (!rows.length) continue;
    // Two rows for one sender: one customer, both rows shown, neither picked.
    const key = [...rows].sort().join("+");
    const row = rows.length === 1 ? crm.find((r) => r.lead_id === rows[0]) : undefined;
    const entry: WaitingCustomer = {
      account: row ? row.company : rows.length > 1 ? (crm.find((r) => r.lead_id === rows[0])?.company ?? rows[0]) : rows[0].replace(/^NEW:/, ""),
      lead_id: row ? row.lead_id : null,
      file: d.file,
      last_customer_message_date: d.last.date,
      days_waiting: daysBetween(d.last.date, referenceDate),
      ...(rows.length > 1 ? { candidate_lead_ids: [...rows].sort() } : {}),
    };
    const cur = best.get(key);
    if (!cur || entry.last_customer_message_date > cur.last_customer_message_date) best.set(key, entry);
  }
  return [...best.values()].sort((x, y) => y.days_waiting - x.days_waiting);
}
