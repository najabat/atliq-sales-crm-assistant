"use client";
import { useEffect, useId, useRef, useState } from "react";
import { formatDate, ITEM_TYPES, TYPE_LABEL } from "@/lib/format";
import { setByRule, type ShownItem } from "@/lib/shown";
import { daysBetween } from "@/lib/rules";
import type { DocView } from "@/lib/screen_data";
import { CLOSE_REASONS, itemView, type Correction, type ItemView } from "@/lib/state";
import { save, undo, type Decision } from "@/lib/store";
import type { ItemType } from "@/lib/types";
import SourcePanel from "./SourcePanel";

export interface ItemCardProps {
  item: ShownItem;
  decisions: Decision[];
  doc: DocView | undefined;
  referenceDate: string;
  nudgeDays: number;
  name: string | null;
  people: string[];
  rowNames: Record<string, string>; // lead ID to company, for two-row items
  rowValues: Record<string, string>; // lead ID to the value the CRM row holds, open deals only. Never estimated
  compact?: boolean; // the brief: no actions, a link to the item in the Owed list instead
  focusOnMount?: boolean; // put focus on this card's status line when it appears, after an undo elsewhere
  onDecided?: (id: string, action: Decision["action"]) => void;
}

export const itemAnchor = (id: string) => `item-${id}`;

// What a correction changed, such as "owner Ayush → Bhavin".
function changedText(v: ItemView): string {
  const parts: string[] = [];
  if (v.type !== v.original.type) parts.push(`type ${TYPE_LABEL[v.original.type]} → ${TYPE_LABEL[v.type]}`);
  if (v.owner !== v.original.owner) parts.push(`owner ${v.original.owner} → ${v.owner}`);
  if (v.due_date !== v.original.due_date) parts.push(`due ${formatDate(v.original.due_date)} → ${formatDate(v.due_date)}`);
  return parts.join(", ");
}

const DONE_TEXT: Partial<Record<Decision["action"], string>> = {
  confirm: "Confirmed.", correct: "Correction saved.", dismiss: "Dismissed as wrong.", close: "Closed.", undo: "Undone.",
};

// One item card, reused on every screen.
export default function ItemCard({ item, decisions, doc, referenceDate, nudgeDays, name, people, rowNames, rowValues,
  compact = false, focusOnMount = false, onDecided }: ItemCardProps) {
  const v = itemView(item, decisions);
  const uid = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"none" | "correct" | "close">("none");
  const [type, setType] = useState<ItemType>(v.type);
  const [owner, setOwner] = useState(v.owner);
  const [due, setDue] = useState(v.due_date ?? "");
  const [reason, setReason] = useState(CLOSE_REASONS[0]);
  const [why, setWhy] = useState("");
  const [status, setStatus] = useState("");
  const [focusTick, setFocusTick] = useState(0);
  const hasDecision = decisions.some((d) => d.target === item.id && d.action !== "undo");
  const live = v.state === "open" || v.state === "confirmed";
  const firm = !!v.due_date && !v.due_approx;
  const overdue = live && firm && v.due_date! < referenceDate;
  const late = overdue ? daysBetween(v.due_date!, referenceDate) : 0;
  const byRule = setByRule(item);

  // Focus goes to the status line after every action, so a keyboard user keeps their place.
  useEffect(() => { if (focusTick > 0) statusRef.current?.focus(); }, [focusTick]);
  useEffect(() => {
    if (!focusOnMount) return;
    setStatus("Undone. The item is open again.");
    statusRef.current?.focus();
  }, [focusOnMount]);

  const after = (action: Decision["action"]) => {
    setStatus(DONE_TEXT[action] ?? "");
    setMode("none");
    setFocusTick((t) => t + 1);
    onDecided?.(item.id, action);
  };
  const decide = (d: Omit<Decision, "by" | "at" | "target">) => {
    if (!name) return;
    save({ target: item.id, by: name, at: new Date().toISOString(), ...d });
    after(d.action);
  };
  const doUndo = () => { if (name) { undo(item.id, name); after("undo"); } };
  // The form always opens on the item as it stands now, corrections included.
  const openCorrect = () => {
    if (mode === "correct") { setMode("none"); return; }
    setType(v.type); setOwner(v.owner); setDue(v.due_date ?? ""); setMode("correct");
  };
  const openClose = () => {
    if (mode === "close") { setMode("none"); return; }
    setReason(CLOSE_REASONS[0]); setWhy(""); setMode("close");
  };
  const saveCorrection = () => {
    const c: Correction = {};
    if (type !== v.type) c.type = type;
    if (owner !== v.owner) c.owner = owner;
    if ((due || null) !== v.due_date) c.due_date = due || null;
    if (Object.keys(c).length) decide({ action: "correct", reason: null, old_value: { type: v.type, owner: v.owner, due_date: v.due_date }, new_value: c });
    else { setMode("none"); setStatus("Nothing changed."); setFocusTick((t) => t + 1); }
  };
  const closeReason = reason === "Other" && why.trim() ? `Other: ${why.trim()}` : reason;

  return (
    <article id={itemAnchor(item.id)} className={`item-card state-${v.state}`} aria-labelledby={`${uid}-sum`}>
      <div className="chips">
        <span className={`chip type-${v.type}`}>{TYPE_LABEL[v.type]}</span>
        {byRule ? <span className="chip">Set by rule</span> : <span className="chip ai">Found by AI</span>}
        {overdue && <span className="chip red">overdue</span>}
        {v.needs_review && <span className="chip amber">needs review</span>}
        {v.candidate_lead_ids && <span className="chip amber">two CRM rows, possible double entry</span>}
        {v.candidate_lead_ids && <span className="chip amber">row match needs review</span>}
        {v.corrected && <span className="chip">corrected by {v.decidedBy}: {changedText(v)}</span>}
        {v.state === "confirmed" && <span className="chip green">confirmed by {v.decidedBy}</span>}
        {v.state === "dismissed" && <span className="chip">dismissed as wrong by {v.decidedBy}</span>}
        {v.state === "closed" && <span className="chip">closed by {v.decidedBy}: {v.closeReason}</span>}
      </div>
      <p id={`${uid}-sum`} className="item-summary">{v.summary}</p>
      <dl className="item-facts">
        <div><dt>Company</dt><dd>{v.account}{v.lead_id ? ` (${v.lead_id})` : ""}</dd></div>
        {v.candidate_lead_ids && (
          <div><dt>CRM rows</dt><dd>
            Two CRM rows fit: {v.candidate_lead_ids.map((id) => `${rowNames[id] ?? "row"} (${id})`).join(" and ")}. Possible double entry. A person decides. Nothing is merged.
          </dd></div>
        )}
        <div><dt>Owner</dt><dd>
          {v.owner === "no owner" ? <span className="chip amber">no owner</span> : v.owner}
          {v.owner !== "no owner" && v.owner_from === "crm" && v.owner === v.original.owner && <span className="chip">deal owner</span>}
        </dd></div>
        <div><dt>Due</dt><dd>
          {v.type === "nudge_due" && !v.due_date ? <>Due now. No reply for {nudgeDays} days or more.</>
            : firm ? formatDate(v.due_date) : v.due_text ? <>“{v.due_text}” <span className="chip amber">approximate</span></> : "not stated"}
          {overdue && (
            <span className="why"> Overdue. {v.due_text ? <>The source says “{v.due_text}”, which is {formatDate(v.due_date)}.</> : <>The source gives {formatDate(v.due_date)}.</>}
              {" "}{late} {late === 1 ? "day" : "days"} overdue on {formatDate(referenceDate)}.</span>
          )}
        </dd></div>
        {v.days_waiting !== null && <div><dt>Waiting</dt><dd>{v.days_waiting} days</dd></div>}
        {v.lead_id && rowValues[v.lead_id] && <div><dt>CRM value</dt><dd>{rowValues[v.lead_id]}</dd></div>}
      </dl>

      <div className="actions">
        <button type="button" aria-expanded={open} aria-controls={`${uid}-src`} onClick={() => setOpen(!open)}>
          {open ? "Hide source" : "Show source"}
        </button>
        {compact && <a className="tap" href={`/owed#${itemAnchor(item.id)}`}>Act on it in the Owed list</a>}
        {!compact && live && (
          <>
            <button type="button" disabled={!name || v.state === "confirmed"} onClick={() => decide({ action: "confirm", reason: null, old_value: v.state, new_value: "confirmed" })}>Confirm</button>
            <button type="button" disabled={!name} aria-expanded={mode === "correct"} onClick={openCorrect}>Correct</button>
            <button type="button" disabled={!name} onClick={() => decide({ action: "dismiss", reason: null, old_value: v.state, new_value: "dismissed" })}>Dismiss as wrong</button>
            <button type="button" disabled={!name} aria-expanded={mode === "close"} onClick={openClose}>Close</button>
          </>
        )}
        {!compact && hasDecision && <button type="button" disabled={!name} onClick={doUndo}>Undo</button>}
      </div>
      <p ref={statusRef} tabIndex={-1} className="status small" aria-live="polite">{status}</p>

      {mode === "correct" && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); saveCorrection(); }}>
          <label>Type <select value={type} onChange={(e) => setType(e.target.value as ItemType)}>
            {ITEM_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select></label>
          <label>Owner <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="no owner">no owner</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select></label>
          <label>Due date <input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
          <button type="submit">Save correction</button>
          <button type="button" onClick={() => setMode("none")}>Cancel</button>
        </form>
      )}
      {mode === "close" && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); decide({ action: "close", reason: closeReason, old_value: v.state, new_value: "closed" }); }}>
          <label>Why close it? <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {CLOSE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select></label>
          {reason === "Other" && <label>Say why <input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={200} /></label>}
          <button type="submit">Close item</button>
          <button type="button" onClick={() => setMode("none")}>Cancel</button>
          <p className="hint">Closing takes it out of the count. Every close is logged with your name and the time.</p>
        </form>
      )}
      {open && doc && <SourcePanel doc={doc} quote={v.quote} id={`${uid}-src`} />}
      {open && !doc && <p id={`${uid}-src`} className="notice small">The source document is not in this build.</p>}
    </article>
  );
}
