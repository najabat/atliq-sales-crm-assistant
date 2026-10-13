// The shape of results.json. Field names follow docs/OUTPUT_SCHEMA.md exactly.

export type ItemType = "reply_owed" | "promise" | "deadline" | "come_back" | "new_need" | "nudge_due";

export interface RunInfo {
  run_id: string;
  prompt_version: string;
  model: string;
  reference_date: string;
  documents: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_seconds: number;
}

export interface DocumentResult {
  file: string;
  accounts: string[];
  internal: boolean;
  last_external_message_from: "customer" | "atliq" | null;
  last_external_message_date: string | null;
  customer_last_message_asks: boolean | null;
  atliq_last_message_expects_answer: boolean | null;
  atliq_last_message_carries_proposal: boolean | null;
  needs_review: boolean;
  instruction_flagged: boolean;
  status: "ok" | "needs review" | "failed";
}

export interface Item {
  id: string;
  file: string;
  type: ItemType;
  account: string;
  lead_id: string | null;
  summary: string;
  quote: string;
  message_date: string;
  owner: string;
  owner_from: "source" | "crm" | null;
  due_date: string | null;
  due_text: string | null;
  due_approx: boolean;
  days_waiting: number | null;
  needs_review: boolean;
  status: string;
  // Set only when two or more CRM rows fit and no single row can be chosen. Then lead_id is null.
  candidate_lead_ids?: string[];
}

export interface WaitingCustomer {
  account: string;
  lead_id: string | null;
  file: string;
  last_customer_message_date: string;
  days_waiting: number;
  // Set only when two or more CRM rows fit and no single row can be chosen. Then lead_id is null.
  candidate_lead_ids?: string[];
}

export interface GoneQuiet {
  account: string;
  lead_id: string | null;
  file: string;
  last_atliq_message_date: string;
  days_since: number;
  quote: string;
  // Set only when two or more CRM rows fit and no single row can be chosen. Then lead_id is null.
  candidate_lead_ids?: string[];
}

export interface NewRow {
  company: string | null;
  contact_name: string | null;
  contact_email: string | null;
  source: string | null;
}

export interface CrmChange {
  id: string;
  lead_id: string | null;
  company: string;
  field: string;
  current: string | null;
  proposed: string | NewRow;
  quote: string | null;
  file: string | null;
  set_by: "rule" | "model";
  status: string;
  // Set when the source fits two or more CRM rows. The change is proposed for each of them and labelled
  // "two CRM rows, possible double entry" on the approval card.
  candidate_lead_ids?: string[];
}

export interface CrmFlag {
  kind: "double_entry" | "no_owner" | "conflict" | "missing_company" | "overdue";
  lead_ids: string[];
  company: string | null;
  file: string | null;
  quote: string | null;
  note: string;
}

export interface Dropped {
  file: string;
  kind: "item" | "crm_change";
  quote: string;
  reason: string;
}

export interface Results {
  run: RunInfo;
  documents: DocumentResult[];
  items: Item[];
  waiting_customers: WaitingCustomer[];
  gone_quiet: GoneQuiet[];
  crm_changes: CrmChange[];
  crm_flags: CrmFlag[];
  dropped: Dropped[];
}
