"use client";
import { useEffect, useId, useRef, useState } from "react";
import { STAGES, type CrmRow } from "@/lib/crm_schema";
import { toCsv, workingCopy } from "@/lib/csv";
import { cellValue, COLUMN_LABEL, displayValue, FIELD_LABEL, fileName, formatDate, plural } from "@/lib/format";
import { findQuoteInMessages, splitMessages } from "@/lib/highlight";
import type { DocView } from "@/lib/screen_data";
import { accountAnchor, accountKey, batchMark, changeCounts, changeView, countLine, flagChoice, flagIdOf, itemView, standingBatch, type ChangeView } from "@/lib/state";
import { exportWork, save, undo, type Decision } from "@/lib/store";
import type { CrmChange, CrmFlag, Item, NewRow } from "@/lib/types";
import { useWork } from "@/lib/useWork";
import SourcePanel from "./SourcePanel";

export interface CrmProps {
  changes: CrmChange[];
  flags: CrmFlag[];
  items: Item[];
  crm: CrmRow[];
  docs: Record<string, DocView>;
  sellers: string[];
  referenceDate: string;
}

const NEW_ROW_FIELDS = ["company", "contact_name", "contact_email", "source"] as const;

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "blank" : displayValue(String(v)));

// A proposed new CRM row, one labelled line per field.
function NewRowLines({ row }: { row: NewRow }) {
  return (
    <dl className="new-row">
      {NEW_ROW_FIELDS.map((k) => <div key={k}><dt>{COLUMN_LABEL[k]}</dt><dd>{row[k] || "not stated"}</dd></div>)}
    </dl>
  );
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The work file is named with the day it was saved, such as atliq_work_2031-01-31.json.
const workFileName = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `atliq_work_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
};

export function Downloads({ changes, flags, crm, onHowItWorks = false }: { changes: CrmChange[]; flags: CrmFlag[]; crm: CrmRow[]; onHowItWorks?: boolean }) {
  const { work } = useWork();
  return (
    <div className="actions">
      <button type="button" onClick={() => download("crm_working_copy.csv", toCsv(workingCopy(crm, changes, flags, work.decisions)), "text/csv")}>
        Download the CRM working copy (CSV)
      </button>
      <button type="button" onClick={() => download(workFileName(), exportWork(), "application/json")}>
        Download the work file
      </button>
      <span className="hint">The work file is a JSON file that holds every decision made on this browser.
        {onHowItWorks ? " Load it back above, here or on another browser." : " Load it back on How it works, here or on another browser."}</span>
    </div>
  );
}

function messageDate(doc: DocView | undefined, quote: string | null): string | null {
  if (!doc || !quote) return null;
  if (!doc.isEmail) return doc.noteDate;
  return findQuoteInMessages(splitMessages(doc.text, true).messages, quote)?.message.date ?? null;
}

const DONE_TEXT: Partial<Record<Decision["action"], string>> = { approve: "Approved.", edit: "Edit saved.", reject: "Rejected. Not applied.", undo: "Undone." };

function ChangeCard({ c, docs, name, sellers }: { c: ChangeView; docs: Record<string, DocView>; name: string | null; sellers: string[] }) {
  const uid = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [row, setRow] = useState<NewRow>({ company: null, contact_name: null, contact_email: null, source: null });
  const [status, setStatus] = useState("");
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => { if (focusTick > 0) statusRef.current?.focus(); }, [focusTick]);
  const doc = c.file ? docs[c.file] : undefined;
  const date = messageDate(doc, c.quote);
  const isNotes = c.field === "notes";
  const isNewRow = c.field === "new_row";
  const after = (a: Decision["action"]) => { setEditing(false); setStatus(DONE_TEXT[a] ?? ""); setFocusTick((t) => t + 1); };
  const decide = (d: Omit<Decision, "by" | "at" | "target">) => { if (name) { save({ target: c.id, by: name, at: new Date().toISOString(), ...d }); after(d.action); } };
  // The form always opens on the value as it stands now, an earlier edit included.
  const openEdit = () => {
    if (editing) { setEditing(false); return; }
    if (isNewRow) setRow({ ...(c.value as NewRow) });
    else setValue(typeof c.value === "string" ? c.value : "");
    setEditing(true);
  };
  // An edit needs a value. To leave the CRM as it is, a seller rejects the change.
  const empty = isNewRow ? !row.company?.trim() : !value.trim();
  const shownValue = c.decision === "edited" ? c.value : c.proposed;
  const label = FIELD_LABEL[c.field] ?? c.field;

  return (
    <li className={`change-card decision-${c.decision}`}>
      <div className="chips">
        {c.decision === "edited" ? <span className="chip green">Edited by {c.decidedBy}</span>
          : <span className={`chip ${c.set_by === "rule" ? "" : "ai"}`}>{c.set_by === "rule" ? "Set by rule" : "Proposed by AI"}</span>}
        {c.candidate_lead_ids && <span className="chip amber">two CRM rows, possible double entry</span>}
        {c.decision === "approved" && <span className="chip green">approved by {c.decidedBy}</span>}
        {c.decision === "rejected" && <span className="chip">rejected by {c.decidedBy}</span>}
      </div>
      {isNewRow ? (
        <div className={`change-line${c.decision === "rejected" ? " not-applied" : ""}`}><strong>{label}.</strong><NewRowLines row={shownValue as NewRow} /></div>
      ) : (
        <p className={`change-line${c.decision === "rejected" ? " not-applied" : ""}`}><strong>{label}.</strong> {show(c.current)} → {show(shownValue)}</p>
      )}
      {c.decision === "rejected" && <p className="small"><strong>Not applied.</strong> The CRM working copy keeps its current value.</p>}
      {c.decision === "edited" && (
        isNewRow ? <div className="small">The AI proposed: <NewRowLines row={c.proposed as NewRow} /></div>
          : <p className="small">{c.set_by === "rule" ? "The rule proposed" : "The AI proposed"}: {show(c.proposed)}.</p>
      )}
      {c.set_by === "rule" ? (
        <p className="small">
          {c.field === "last_contact_date" && <>The latest message with the customer, or the latest call note, is dated {formatDate(String(c.proposed))}.</>}
          {c.field === "next_followup_date" && <>The nearest firm due date among this account&apos;s open items.</>}
          {doc && <> Source: {fileName(doc.file)}. <a className="tap" href={`/documents/${doc.id}`}>Open the document</a></>}
          {c.candidate_lead_ids && <> The source fits two CRM rows, so the date is proposed for both. A person decides if they are one company.</>}
        </p>
      ) : (
        <p className="small">Source line{date ? ` of ${formatDate(date)}` : ""}: “{c.quote}”{doc ? ` in ${fileName(doc.file)}` : ""}.</p>
      )}
      {isNotes && <p className="small">A quote found word for word proves the source line exists. It does not prove the update line says what the source means. Read the full source before you approve.</p>}

      <div className="actions">
        {c.decision === "proposed" ? (
          <>
            <button type="button" disabled={!name} onClick={() => decide({ action: "approve", reason: null, old_value: c.current, new_value: c.proposed })}>Approve</button>
            <button type="button" disabled={!name} aria-expanded={editing} onClick={openEdit}>Edit</button>
            <button type="button" disabled={!name} onClick={() => decide({ action: "reject", reason: null, old_value: c.current, new_value: null })}>Reject</button>
          </>
        ) : (
          <button type="button" disabled={!name} onClick={() => { if (name) { undo(c.id, name); after("undo"); } }}>Undo</button>
        )}
        {doc && c.set_by === "model" && !isNotes && (
          <button type="button" aria-expanded={open} aria-controls={`${uid}-src`} onClick={() => setOpen(!open)}>{open ? "Hide source" : "Show source"}</button>
        )}
      </div>
      <p ref={statusRef} tabIndex={-1} className="status small" aria-live="polite">{status}</p>

      {editing && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (!empty) decide({ action: "edit", reason: null, old_value: c.current, new_value: isNewRow ? row : value.trim() }); }}>
          {c.field === "status" && <label>Stage <select value={value} onChange={(e) => setValue(e.target.value)}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></label>}
          {c.field === "owner" && <label>Owner <select value={value} onChange={(e) => setValue(e.target.value)}>{sellers.map((s) => <option key={s}>{s}</option>)}</select></label>}
          {(c.field === "last_contact_date" || c.field === "next_followup_date") && <label>Date <input type="date" value={value} onChange={(e) => setValue(e.target.value)} /></label>}
          {c.field === "est_value_usd" && <label>Value in USD <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))} /></label>}
          {(c.field === "notes" || c.field === "service_interest") && <label className="wide">{FIELD_LABEL[c.field]} <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} /></label>}
          {isNewRow && NEW_ROW_FIELDS.map((k) => (
            <label key={k}>{COLUMN_LABEL[k]} <input value={row[k] ?? ""} onChange={(e) => setRow({ ...row, [k]: e.target.value || null })} /></label>
          ))}
          <button type="submit" disabled={empty}>Save edit</button>
          <button type="button" onClick={() => setEditing(false)}>Cancel</button>
          {empty && <p className="hint">Enter a value to save an edit{isNewRow ? ", at least the company" : ""}. To leave the CRM as it is, use Reject.</p>}
        </form>
      )}
      {doc && (isNotes || open) && <SourcePanel doc={doc} quote={c.quote} full={isNotes} id={`${uid}-src`} />}
    </li>
  );
}

const DOUBLE_COLUMNS = ["lead_id", "company", "contact_name", "contact_email", "status", "owner", "est_value_usd", "created_date", "last_contact_date"] as const;

function FlagBox({ f, name, sellers, items, referenceDate, rows }:
  { f: CrmFlag; name: string | null; sellers: string[]; items: Item[]; referenceDate: string; rows: Map<string, CrmRow> }) {
  const { work } = useWork();
  const id = flagIdOf(f);
  const choice = flagChoice(id, work.decisions);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const [acted, setActed] = useState(0);
  useEffect(() => { if (acted > 0) resultRef.current?.focus(); }, [acted]);
  const [pick, setPick] = useState(f.kind === "conflict" ? "leave" : sellers[0]);
  const decide = (action: Decision["action"], new_value: unknown) => {
    if (!name) return;
    save({ target: id, action, by: name, at: new Date().toISOString(), reason: null, old_value: null, new_value });
    setActed((n) => n + 1);
  };
  const undoBtn = choice && <button type="button" disabled={!name} onClick={() => { if (name) { undo(id, name); setActed((n) => n + 1); } }}>Undo</button>;
  const result = (body: React.ReactNode) => <p ref={resultRef} tabIndex={-1} className="status">{body}</p>;

  if (f.kind === "no_owner") return (
    <div className="flag-box"><span className="chip amber">no owner</span> This row has no owner.
      {choice ? result(<>Owner set to <strong>{String(choice.new_value)}</strong> by {choice.by}. {undoBtn}</>) : (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); decide("edit", pick); }}>
          <label>Pick an owner <select value={pick} onChange={(e) => setPick(e.target.value)}>{sellers.map((s) => <option key={s}>{s}</option>)}</select></label>
          <button type="submit" disabled={!name}>Set owner</button>
          {result(acted > 0 ? "Undone." : "")}
        </form>
      )}
    </div>
  );
  if (f.kind === "conflict") return (
    <div className="flag-box"><span className="chip amber">conflict</span> No clean stage fits. Both sides:
      <p className="small">{f.note}</p>
      {f.quote && <p className="small">Source line: “{f.quote}”{f.file ? ` in ${fileName(f.file)}` : ""}.</p>}
      {choice ? result(<>{choice.new_value === "leave" ? "Left as it is" : <>Stage set to <strong>{String(choice.new_value)}</strong></>} by {choice.by}. {undoBtn}</>) : (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); decide(pick === "leave" ? "confirm" : "edit", pick); }}>
          <label>Your call <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="leave">Leave the stage as it is</option>{STAGES.map((s) => <option key={s}>{s}</option>)}
          </select></label>
          <button type="submit" disabled={!name}>Save</button>
          {result(acted > 0 ? "Undone." : "")}
        </form>
      )}
    </div>
  );
  if (f.kind === "overdue") {
    const late = items.map((i) => itemView(i, work.decisions))
      .filter((v) => v.lead_id === f.lead_ids[0] && v.due_date && !v.due_approx && v.due_date < referenceDate);
    return (
      <div className="flag-box"><span className="chip red">overdue</span> Every firm date on this account has passed, so no next step date is proposed.
        <ul>{late.map((v) => <li key={v.id}>{v.summary} Due {formatDate(v.due_date)}.</li>)}</ul>
      </div>
    );
  }
  if (f.kind === "missing_company") return (
    <div className="flag-box"><span className="chip amber">not in the CRM</span> This company has no CRM row. A new row is proposed below for approval. Unknown fields stay empty.</div>
  );
  if (f.kind === "double_entry") {
    const [a, b] = f.lead_ids.map((x) => rows.get(x));
    return (
      <div className="flag-box"><span className="chip amber">possible double entry</span> {f.note}
        <div className="table-wrap"><table className="stack-table pair-table">
          <thead><tr><th scope="col">Field</th><th scope="col">First row</th><th scope="col">Second row</th></tr></thead>
          <tbody>{DOUBLE_COLUMNS.map((k) => (
            <tr key={k}><th scope="row">{COLUMN_LABEL[k]}</th>
              <td data-label="First row">{cellValue(k, a?.[k])}</td><td data-label="Second row">{cellValue(k, b?.[k])}</td></tr>
          ))}</tbody>
        </table></div>
        {choice ? result(<>Marked as <strong>{String(choice.new_value)}</strong> by {choice.by}. Nothing is merged. {undoBtn}</>) : (
          <div className="actions">
            <button type="button" disabled={!name} onClick={() => decide("confirm", "one company")}>They are one company</button>
            <button type="button" disabled={!name} onClick={() => decide("confirm", "two deals")}>They are two deals</button>
            {result(acted > 0 ? "Undone." : "")}
          </div>
        )}
      </div>
    );
  }
  return null;
}

// One account: its flags, its change cards, then the one action for the whole account below the cards.
function AccountSection({ acc, name, p, rows }: {
  acc: { company: string; lead: string | null; changes: ChangeView[]; flags: CrmFlag[] }; name: string | null; p: CrmProps; rows: Map<string, CrmRow>;
}) {
  const { work } = useWork();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [status, setStatus] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => { if (tick > 0) statusRef.current?.focus(); }, [tick]);
  const key = accountKey(acc.lead, acc.company);
  const proposed = acc.changes.filter((c) => c.decision === "proposed");
  const batch = standingBatch(work.decisions, acc.changes.map((c) => c.id));
  const row = acc.lead ? rows.get(acc.lead) : undefined;
  const hid = accountAnchor(key);

  // One action approves every pending change of the account. All its approvals carry one batch mark,
  // so one Undo reverses exactly that action and nothing approved separately.
  const approveAll = () => {
    if (!name) return;
    const at = new Date().toISOString();
    const reason = batchMark(key, at);
    save(proposed.map((c) => ({ target: c.id, action: "approve" as const, by: name, at, reason, old_value: c.current, new_value: c.proposed })));
    setStatus(`Approved ${plural(proposed.length, "change", "changes")}.`); setTick((t) => t + 1);
  };
  const undoAll = () => {
    if (!name || !batch.length) return;
    undo(batch, name);
    setStatus(`Undone. ${plural(batch.length, "change waits", "changes wait")} again.`); setTick((t) => t + 1);
  };

  return (
    <section aria-labelledby={`${hid}-h`} className="account" id={hid}>
      <h2 id={`${hid}-h`} className="band-sub">{acc.company}{acc.lead ? ` (${acc.lead})` : ""}</h2>
      {row ? <p className="small">CRM today: stage {row.status || "blank"}, owner {row.owner || "no owner"}.</p> : <p className="small">Not in the CRM.</p>}
      {acc.flags.map((f) => <FlagBox key={flagIdOf(f)} f={f} name={name} sellers={p.sellers} items={p.items} referenceDate={p.referenceDate} rows={rows} />)}
      {acc.changes.length > 0 && <ul className="card-list">{acc.changes.map((c) => <ChangeCard key={c.id} c={c} docs={p.docs} name={name} sellers={p.sellers} />)}</ul>}
      {(proposed.length >= 2 || batch.length > 0) && (
        <div className="actions">
          {proposed.length >= 2 && (
            <button type="button" className="primary" disabled={!name} onClick={approveAll}>Approve all for this account ({proposed.length})</button>
          )}
          {batch.length > 0 && <button type="button" disabled={!name} onClick={undoAll}>Undo approve all for this account ({batch.length})</button>}
        </div>
      )}
      <p ref={statusRef} tabIndex={-1} className="status small" aria-live="polite">{status}</p>
    </section>
  );
}

export default function CrmView(p: CrmProps) {
  const { work, name } = useWork();
  const rows = new Map(p.crm.map((r) => [r.lead_id, r]));
  const views = p.changes.map((c) => changeView(c, work.decisions));
  const accounts = new Map<string, { company: string; lead: string | null; changes: ChangeView[]; flags: CrmFlag[] }>();
  const add = (k: string, company: string, lead: string | null) => {
    if (!accounts.has(k)) accounts.set(k, { company, lead, changes: [], flags: [] });
    return accounts.get(k)!;
  };
  for (const c of views) add(accountKey(c.lead_id, c.company), c.company, c.lead_id).changes.push(c);
  const doubles = p.flags.filter((f) => f.kind === "double_entry");
  for (const f of p.flags.filter((x) => x.kind !== "double_entry")) {
    const lead = f.lead_ids[0] ?? null;
    add(accountKey(lead, f.company), f.company ?? rows.get(lead ?? "")?.company ?? "", lead).flags.push(f);
  }
  const list = [...accounts.values()].sort((a, b) => a.company.localeCompare(b.company));

  return (
    <>
      <p className="notice">Approving changes the working copy. Kaizen itself is never touched.</p>
      <p>{countLine(changeCounts(views, p.flags))}</p>
      {!name && <p className="notice">Pick your name in Working as to approve, edit or reject.</p>}
      <Downloads changes={p.changes} flags={p.flags} crm={p.crm} />

      {doubles.length > 0 && (
        <section aria-labelledby="doubles-h">
          <h2 id="doubles-h" className="band-sub">Possible double entries</h2>
          {doubles.map((f) => <FlagBox key={flagIdOf(f)} f={f} name={name} sellers={p.sellers} items={p.items} referenceDate={p.referenceDate} rows={rows} />)}
        </section>
      )}

      {list.map((acc) => <AccountSection key={accountKey(acc.lead, acc.company)} acc={acc} name={name} p={p} rows={rows} />)}
      <Downloads changes={p.changes} flags={p.flags} crm={p.crm} />
    </>
  );
}
