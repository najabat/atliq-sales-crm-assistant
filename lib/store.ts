// The one place that keeps a seller's work: every decision and every captured note.
// Six functions. Load, save, undo, export, import a saved file and reset. The screens call only these,
// so a database can replace the browser later without a change to any screen.
// It uses the browser's own storage today. Every read and write is guarded, so a blocked store still works in memory.

export type Action = "confirm" | "correct" | "dismiss" | "close" | "approve" | "edit" | "reject" | "undo";

export interface Decision {
  target: string; // an item id, a change id or a flag id
  action: Action;
  by: string; // the name picked in "Working as". A label for the log, not a sign-in
  at: string; // the time of the decision
  reason: string | null;
  old_value: unknown;
  new_value: unknown;
}

export interface WorkFile {
  app: "atliq-sales-crm-assistant";
  version: 1;
  decisions: Decision[];
  notes: unknown[]; // captured notes arrive with Quick capture
}

export interface Storage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const KEY = "atliq-work-v1";
const ACTIONS: Action[] = ["confirm", "correct", "dismiss", "close", "approve", "edit", "reject", "undo"];
export const STORE_EVENT = "atliq-work-changed";

const empty = (): WorkFile => ({ app: "atliq-sales-crm-assistant", version: 1, decisions: [], notes: [] });
let memory: WorkFile = empty();

function storage(custom?: Storage): Storage | null {
  if (custom) return custom;
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

function write(state: WorkFile, custom?: Storage): WorkFile {
  memory = state;
  try { storage(custom)?.setItem(KEY, JSON.stringify(state)); } catch { /* blocked storage: keep it in memory */ }
  try { if (typeof window !== "undefined") window.dispatchEvent(new Event(STORE_EVENT)); } catch { /* no window in tests */ }
  return state;
}

// A work file is accepted only in this exact shape.
export function isWorkFile(x: unknown): x is WorkFile {
  if (!x || typeof x !== "object") return false;
  const w = x as Record<string, unknown>;
  if (w.app !== "atliq-sales-crm-assistant" || w.version !== 1 || !Array.isArray(w.decisions) || !Array.isArray(w.notes)) return false;
  return w.decisions.every((d) => {
    if (!d || typeof d !== "object") return false;
    const r = d as Record<string, unknown>;
    return typeof r.target === "string" && r.target.length > 0 && ACTIONS.includes(r.action as Action) &&
      typeof r.by === "string" && typeof r.at === "string" && !Number.isNaN(Date.parse(r.at as string)) &&
      (r.reason === null || typeof r.reason === "string") && "old_value" in r && "new_value" in r;
  });
}

// 1. Load the seller's work from this browser.
export function load(custom?: Storage): WorkFile {
  try {
    const raw = storage(custom)?.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isWorkFile(parsed)) { memory = parsed; return parsed; }
    }
  } catch { /* unreadable: fall back to memory */ }
  return memory;
}

// 2. Save one or more decisions. One action, such as approving a whole account, saves them together.
export function save(decisions: Decision | Decision[], custom?: Storage): WorkFile {
  const list = Array.isArray(decisions) ? decisions : [decisions];
  const state = load(custom);
  return write({ ...state, decisions: [...state.decisions, ...list] }, custom);
}

// 3. Undo the latest standing decision on each target. The undo is logged too, so the history stays complete.
export function undo(targets: string | string[], by: string, custom?: Storage): WorkFile {
  const at = new Date().toISOString();
  const list = (Array.isArray(targets) ? targets : [targets]).map((target): Decision =>
    ({ target, action: "undo", by, at, reason: null, old_value: null, new_value: null }));
  return save(list, custom);
}

// 4. Export the work as a file that can be loaded again on any browser.
export function exportWork(custom?: Storage): string {
  return JSON.stringify(load(custom), null, 2);
}

// 5. Import a saved work file. Anything that is not a work file is refused and nothing changes.
export function importWork(text: string, custom?: Storage): { ok: true; decisions: number } | { ok: false; error: string } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { ok: false, error: "This file is not a work file. Nothing was changed." }; }
  if (!isWorkFile(parsed)) return { ok: false, error: "This file is not a work file from this assistant. Nothing was changed." };
  write(parsed, custom);
  return { ok: true, decisions: parsed.decisions.length };
}

// 6. Reset this browser to a fresh state.
export function reset(custom?: Storage): WorkFile {
  try { storage(custom)?.removeItem(KEY); } catch { /* blocked storage */ }
  return write(empty(), custom);
}
