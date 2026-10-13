// The North Star and the customers waiting, as the brief counts them. Browser safe.
// Shared by the Daily brief and the saved brief on Quick capture, so both always show the same numbers.
import type { CrmRow } from "./crm_schema.ts";
import type { ShownItem } from "./shown.ts";
import { itemView } from "./state.ts";
import type { Decision } from "./store.ts";
import type { WaitingCustomer } from "./types.ts";

// The value of an open deal as the CRM holds it. Won and Lost deals and rows with no value give nothing. Never estimated.
export const openValue = (r: CrmRow | undefined) =>
  (r && r.est_value_usd && r.status !== "Won" && r.status !== "Lost" ? Number(r.est_value_usd) : null);

export interface WaitRow {
  w: WaitingCustomer;
  row: CrmRow | undefined;
  two: boolean;
  asked: string | null;
  settled: boolean;
  owner: string | null;
  value: number | null;
}

// A customer stops counting when a seller closes or dismisses the reply owed on that thread.
export function waitingRows(waiting: WaitingCustomer[], items: ShownItem[], crm: CrmRow[], decisions: Decision[]): WaitRow[] {
  const byId = new Map(crm.map((r) => [r.lead_id, r]));
  const views = items.filter((i) => i.type === "reply_owed").map((i) => itemView(i, decisions));
  return waiting.map((w) => {
    const row = w.lead_id ? byId.get(w.lead_id) : undefined;
    const two = (w.candidate_lead_ids?.length ?? 0) > 1;
    const asks = views.filter((v) => v.type === "reply_owed" && v.file === w.file && (v.lead_id === w.lead_id || v.account === w.account));
    const settled = asks.length > 0 && asks.every((v) => v.state === "closed" || v.state === "dismissed");
    return { w, row, two, asked: asks[0]?.summary ?? null, settled, owner: two ? null : row?.owner || null, value: two ? null : openValue(row) };
  }).sort((a, b) => b.w.days_waiting - a.w.days_waiting);
}

export function northStar(rows: WaitRow[], crm: CrmRow[], limitDays: number) {
  const counted = rows.filter((r) => !r.settled);
  const over = counted.filter((r) => r.w.days_waiting > limitDays);
  return {
    counted, over,
    valueOver: over.reduce((s, r) => s + (r.value ?? 0), 0),
    pipeline: crm.reduce((s, r) => s + (openValue(r) ?? 0), 0),
    settledCount: rows.length - counted.length,
  };
}
