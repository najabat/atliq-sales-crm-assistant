// The working copy of the CRM export. The 13 columns of the export, one row per lead.
// Approved and edited changes are written into it. Nothing else is touched and the live CRM never is.
import { CRM_COLUMNS, type CrmRow } from "./crm_schema.ts";
import { changeView, flagChoice, flagIdOf } from "./state.ts";
import type { Decision } from "./store.ts";
import type { CrmChange, CrmFlag, NewRow } from "./types.ts";

export function workingCopy(crm: CrmRow[], changes: CrmChange[], flags: CrmFlag[], decisions: Decision[]): CrmRow[] {
  const rows = crm.map((r) => ({ ...r }));
  const byId = new Map(rows.map((r) => [r.lead_id, r]));
  const added: CrmRow[] = [];
  for (const c of changes) {
    const v = changeView(c, decisions);
    if (v.decision !== "approved" && v.decision !== "edited") continue;
    if (c.field === "new_row") {
      // A new row fills only company, contact name, contact email and source. It gets no lead ID here.
      const n = v.value as NewRow;
      const r = Object.fromEntries(CRM_COLUMNS.map((k) => [k, ""])) as CrmRow;
      r.company = n.company ?? ""; r.contact_name = n.contact_name ?? ""; r.contact_email = n.contact_email ?? ""; r.source = n.source ?? "";
      added.push(r);
      continue;
    }
    const row = c.lead_id ? byId.get(c.lead_id) : undefined;
    if (row && (CRM_COLUMNS as readonly string[]).includes(c.field)) row[c.field as keyof CrmRow] = String(v.value ?? "");
  }
  // A seller's pick on a flag: an owner for a row with none, or a stage where the evidence was in conflict.
  for (const f of flags) {
    const d = flagChoice(flagIdOf(f), decisions);
    if (!d || d.action !== "edit" || typeof d.new_value !== "string") continue;
    const row = byId.get(f.lead_ids[0]);
    if (!row) continue;
    if (f.kind === "no_owner") row.owner = d.new_value;
    if (f.kind === "conflict") row.status = d.new_value;
  }
  return [...rows, ...added];
}

const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// Line ends match the export, so with no decisions the working copy is the export byte for byte.
export function toCsv(rows: CrmRow[]): string {
  return [CRM_COLUMNS.join(","), ...rows.map((r) => CRM_COLUMNS.map((k) => cell(r[k] ?? "")).join(","))].join("\n") + "\n";
}
