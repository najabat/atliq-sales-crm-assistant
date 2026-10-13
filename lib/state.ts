// Replays a seller's decisions into what the screens show. Pure functions, browser safe.
import type { Decision } from "./store.ts";
import type { CrmChange, Item, ItemType } from "./types.ts";

// The decisions still standing on a target. An undo removes the latest standing one.
export function standing(decisions: Decision[], target: string): Decision[] {
  const stack: Decision[] = [];
  for (const d of decisions) {
    if (d.target !== target) continue;
    if (d.action === "undo") stack.pop();
    else stack.push(d);
  }
  return stack;
}

export interface Correction { type?: ItemType; owner?: string; due_date?: string | null }

export interface ItemView extends Item {
  state: "open" | "confirmed" | "dismissed" | "closed";
  closeReason: string | null;
  corrected: boolean;
  decidedBy: string | null;
  decidedAt: string | null;
  original: { type: ItemType; owner: string; due_date: string | null };
}

export const CLOSE_REASONS = ["Done", "Answered elsewhere", "No longer needed", "Other"];

// An item as the seller left it. Corrections change type, owner or date. The latest confirm, dismiss or close sets its state.
export function itemView(item: Item, decisions: Decision[]): ItemView {
  const s = standing(decisions, item.id);
  const v: ItemView = {
    ...item, state: "open", closeReason: null, corrected: false, decidedBy: null, decidedAt: null,
    original: { type: item.type, owner: item.owner, due_date: item.due_date },
  };
  for (const d of s) {
    if (d.action === "correct" && d.new_value && typeof d.new_value === "object") {
      const c = d.new_value as Correction;
      if (c.type) v.type = c.type;
      if (c.owner) { v.owner = c.owner; v.owner_from = c.owner === "no owner" ? null : v.owner_from; }
      if ("due_date" in c) { v.due_date = c.due_date ?? null; v.due_approx = !c.due_date && !!v.due_text; }
      v.corrected = true;
    }
    if (d.action === "confirm") v.state = "confirmed";
    if (d.action === "dismiss") v.state = "dismissed";
    if (d.action === "close") { v.state = "closed"; v.closeReason = d.reason; }
    v.decidedBy = d.by;
    v.decidedAt = d.at;
  }
  return v;
}

// Still on the list: not closed and not dismissed.
export const isLive = (v: Pick<ItemView, "state">) => v.state === "open" || v.state === "confirmed";

// Overdue the way the Daily brief counts it: still live, a firm date the source states, before the reference date. Nudges have no due date.
export const isOverdue = (v: ItemView, referenceDate: string) =>
  isLive(v) && !!v.due_date && !v.due_approx && v.type !== "nudge_due" && v.due_date < referenceDate;

// The "Check these first" group of the Owed list.
export const needsCheck = (v: ItemView) => isLive(v) && v.status === "needs review";

export interface ChangeView extends CrmChange {
  decision: "proposed" | "approved" | "edited" | "rejected";
  value: CrmChange["proposed"]; // the value that goes into the working copy when approved or edited
  decidedBy: string | null;
  decidedAt: string | null;
}

// A CRM change as the seller left it. Only the latest standing decision counts.
export function changeView(change: CrmChange, decisions: Decision[]): ChangeView {
  const last = standing(decisions, change.id).at(-1);
  const v: ChangeView = { ...change, decision: "proposed", value: change.proposed, decidedBy: null, decidedAt: null };
  if (!last) return v;
  v.decidedBy = last.by;
  v.decidedAt = last.at;
  if (last.action === "approve") v.decision = "approved";
  if (last.action === "reject") v.decision = "rejected";
  if (last.action === "edit") { v.decision = "edited"; v.value = last.new_value as CrmChange["proposed"]; }
  return v;
}

// "Approve all" is one action. Each approval it saves carries the same batch mark in its reason.
export const BATCH_PREFIX = "approve_all:";
export const batchMark = (accountKey: string, at: string) => `${BATCH_PREFIX}${accountKey}:${at}`;

// The changes of the latest approve-all batch that still stand on these targets. Undoing them reverses exactly
// that one action: an approval made on its own, or a later decision on a card, is left alone.
export function standingBatch(decisions: Decision[], targets: string[]): string[] {
  const tops = targets.map((t) => ({ t, top: standing(decisions, t).at(-1) }))
    .filter((x) => x.top?.action === "approve" && x.top.reason?.startsWith(BATCH_PREFIX));
  if (!tops.length) return [];
  const latest = tops.map((x) => x.top!.reason!).sort().at(-1)!;
  return tops.filter((x) => x.top!.reason === latest).map((x) => x.t);
}

// A flag decision, such as a picked owner or a stage, or null when the seller has not decided.
export function flagChoice(flagId: string, decisions: Decision[]): Decision | null {
  return standing(decisions, flagId).at(-1) ?? null;
}

// A short stable hash, so two flags of one kind on one row, such as two conflicts on one source line, never share an id.
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export const flagIdOf = (f: { kind: string; lead_ids: string[]; company: string | null; file?: string | null; quote?: string | null; note?: string }) =>
  `flag:${f.kind}:${f.lead_ids.join("+") || f.company || ""}:${shortHash(`${f.file ?? ""}|${f.quote ?? ""}|${f.note ?? ""}`)}`;

// One account key for the brief and the CRM screen: the lead ID, or NEW: and the company for a company not in the CRM.
export const accountKey = (lead: string | null, company: string | null) => lead ?? `NEW:${company ?? ""}`;
export const accountAnchor = (key: string) => `acc-${key.replace(/[^a-zA-Z0-9]/g, "-")}`;

// The same counts on both screens: changes waiting, the accounts they sit on, and accounts that carry flags only.
export function changeCounts(views: ChangeView[], flags: { kind: string; lead_ids: string[]; company: string | null }[]) {
  const pendingBy = new Map<string, { company: string; lead: string | null; n: number }>();
  for (const c of views.filter((x) => x.decision === "proposed")) {
    const k = accountKey(c.lead_id, c.company);
    const e = pendingBy.get(k) ?? { company: c.company, lead: c.lead_id, n: 0 };
    e.n++;
    pendingBy.set(k, e);
  }
  const withChanges = new Set(views.map((c) => accountKey(c.lead_id, c.company)));
  const flagOnly = new Set(flags.filter((f) => f.kind !== "double_entry").map((f) => accountKey(f.lead_ids[0] ?? null, f.company))
    .filter((k) => !withChanges.has(k)));
  const pending = [...pendingBy.values()].reduce((s, e) => s + e.n, 0);
  return { pending, pendingBy, flagOnly: flagOnly.size };
}

export function countLine(c: ReturnType<typeof changeCounts>): string {
  const n = c.pending, a = c.pendingBy.size;
  const head = `${n} ${n === 1 ? "change waits" : "changes wait"} for a decision on ${a} ${a === 1 ? "account" : "accounts"}`;
  return c.flagOnly > 0 ? `${head}, plus ${c.flagOnly} ${c.flagOnly === 1 ? "account" : "accounts"} with flags only.` : `${head}.`;
}

// Decisions that still stand, one per target, as opposed to every action in the log, undos included.
export function standingCount(decisions: Decision[]): number {
  return [...new Set(decisions.map((d) => d.target))].filter((t) => standing(decisions, t).length > 0).length;
}
