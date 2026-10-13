// Formatting for the screens. Browser safe.
import type { ItemType } from "./types.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// One display format everywhere, such as 20 Feb 2026.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "not stated";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

// A CRM value for display. A plain ISO date is shown in the one date format, anything else as it is.
export const displayValue = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(v) : v);

export const formatUsd =(n: number): string => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);

export const TYPE_LABEL: Record<ItemType, string> = {
  reply_owed: "Reply owed", promise: "Promise", deadline: "Deadline", come_back: "Come-back", new_need: "New need", nudge_due: "Nudge due",
};
export const ITEM_TYPES = Object.keys(TYPE_LABEL) as ItemType[];

export const FIELD_LABEL: Record<string, string> = {
  status: "Stage", notes: "Notes", est_value_usd: "Value (USD)", service_interest: "Service interest", owner: "Owner",
  last_contact_date: "Last contact date", next_followup_date: "Next step date", new_row: "New CRM row",
};

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const fileName = (file: string) => file.split("/").pop() ?? file;

// Display names for people. The technical model id and prompt version stay on screen in small text for traceability.
const MODEL_NAME: Record<string, string> = { "claude-haiku-5-5": "Claude Haiku 5.5" };
const VERSION_NAME: Record<string, string> = { "v5-r7+c2v4-cr5.1": "3.1" };
export const modelName = (id: string) => MODEL_NAME[id] ?? id;
export const versionName = (v: string) => VERSION_NAME[v] ?? v;

// CRM column names in plain words, for tables that show a whole row.
export const COLUMN_LABEL: Record<string, string> = {
  lead_id: "Lead ID", company: "Company", contact_name: "Contact name", contact_email: "Contact email", source: "Source",
  service_interest: "Service interest", status: "Stage", est_value_usd: "Value (USD)", owner: "Owner", created_date: "Created",
  last_contact_date: "Last contact", next_followup_date: "Next step date", notes: "Notes",
};

// A CRM cell for display: dates in the one format, values in dollars, an empty cell as "not stated".
export function cellValue(column: string, v: string | null | undefined): string {
  if (!v) return "not stated";
  if (column === "est_value_usd" && /^\d+$/.test(v)) return formatUsd(Number(v));
  return displayValue(v);
}
