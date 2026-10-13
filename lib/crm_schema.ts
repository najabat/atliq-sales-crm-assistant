// The CRM export's columns and stages. Browser safe: no file reading here, so screens can import it.
export const CRM_COLUMNS = [
  "lead_id", "company", "contact_name", "contact_email", "source", "service_interest", "status",
  "est_value_usd", "owner", "created_date", "last_contact_date", "next_followup_date", "notes",
] as const;

export type CrmColumn = (typeof CRM_COLUMNS)[number];
export type CrmRow = Record<CrmColumn, string>;

export const STAGES = ["New", "Contacted", "Proposal Sent", "Won", "Lost"] as const;

export const isClosed = (row: CrmRow): boolean => row.status === "Won" || row.status === "Lost";
