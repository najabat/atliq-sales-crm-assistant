"use client";
import { useEffect, useRef, useState } from "react";
import { ITEM_TYPES, TYPE_LABEL } from "@/lib/format";
import { orderItems } from "@/lib/rules";
import type { DocView } from "@/lib/screen_data";
import { setByRule, type ShownItem } from "@/lib/shown";
import { isLive, isOverdue, itemView, type ItemView } from "@/lib/state";
import { undo, type Decision } from "@/lib/store";
import { useWork } from "@/lib/useWork";
import ItemCard from "./ItemCard";

export interface OwedProps {
  items: ShownItem[];
  docs: Record<string, DocView>;
  people: string[];
  rowNames: Record<string, string>;
  rowValues: Record<string, string>;
  referenceDate: string;
  nudgeDays: number;
}

// What stays in place of an item a seller just closed or dismissed, so the list does not jump and Undo is right there.
function Stub({ v, name, onUndo }: { v: ItemView; name: string | null; onUndo: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const what = v.state === "closed" ? `Closed: ${v.closeReason}.` : "Dismissed as wrong.";
  return (
    <div ref={ref} tabIndex={-1} className="stub" role="status">
      <span><strong>{what}</strong> {v.summary} It moved to Closed and dismissed below.</span>
      <button type="button" disabled={!name} onClick={onUndo}>Undo</button>
    </div>
  );
}

// Everything AtliQ owes, in one order. Nothing is hidden, merged or dropped: items to check come first in their own group,
// closed and dismissed items move to their own section, and filters say how many they leave out.
export default function OwedList({ items, docs, people, rowNames, rowValues, referenceDate, nudgeDays }: OwedProps) {
  const { work, name } = useWork();
  const [type, setType] = useState("all");
  const [owner, setOwner] = useState("all");
  const [review, setReview] = useState(false);
  const [madeBy, setMadeBy] = useState<"all" | "rule" | "ai">("all");
  const [due, setDue] = useState<"all" | "overdue">("all");
  // The Due filter lives in the address, so a link such as /owed?due=overdue opens the list filtered.
  useEffect(() => { if (new URLSearchParams(window.location.search).get("due") === "overdue") setDue("overdue"); }, []);
  const changeDue = (d: "all" | "overdue") => {
    setDue(d);
    const url = new URL(window.location.href);
    if (d === "all") url.searchParams.delete("due"); else url.searchParams.set("due", d);
    window.history.replaceState(null, "", url);
  };
  const [recent, setRecent] = useState<string[]>([]); // closed or dismissed on this visit, shown as a stub in place
  const [focusId, setFocusId] = useState<string | null>(null);
  const originals = new Map(items.map((i) => [i.id, i]));
  const views = items.map((i) => itemView(i, work.decisions));
  const filtered = type !== "all" || owner !== "all" || madeBy !== "all" || review || due !== "all";
  const keep = (v: ItemView) =>
    (type === "all" || v.type === type) && (owner === "all" || v.owner === owner)
    && (madeBy === "all" || (madeBy === "rule") === setByRule(originals.get(v.id)!)) && (!review || v.status === "needs review")
    && (due === "all" || isOverdue(v, referenceDate));
  // The ordering rule from lib/rules.ts, unchanged. It keeps each item whole, so the view fields stay.
  const inList = orderItems(views.filter((v) => isLive(v) || recent.includes(v.id)), referenceDate) as ItemView[];
  const toCheck = (v: ItemView) => v.status === "needs review";
  const checkAll = inList.filter(toCheck), restAll = inList.filter((v) => !toCheck(v));
  const check = checkAll.filter(keep), rest = restAll.filter(keep);
  const live = inList.filter(isLive);
  const shownLive = live.filter(keep);
  const done = views.filter((v) => !isLive(v));
  const shownDone = done.filter(keep);
  const owners = [...new Set(["no owner", ...people, ...views.map((v) => v.owner)])];

  const onDecided = (id: string, action: Decision["action"]) => {
    if (action === "close" || action === "dismiss") setRecent((r) => (r.includes(id) ? r : [...r, id]));
    setFocusId(null);
  };
  const undoStub = (id: string) => {
    if (!name) return;
    undo(id, name);
    setRecent((r) => r.filter((x) => x !== id));
    setFocusId(id);
  };
  const card = (v: ItemView) => (
    <li key={v.id}>
      {isLive(v) ? (
        <ItemCard item={originals.get(v.id)!} decisions={work.decisions} doc={docs[v.file]} referenceDate={referenceDate} nudgeDays={nudgeDays}
          name={name} people={people} rowNames={rowNames} rowValues={rowValues} focusOnMount={focusId === v.id} onDecided={onDecided} />
      ) : <Stub v={v} name={name} onUndo={() => undoStub(v.id)} />}
    </li>
  );
  const doneCard = (v: ItemView) => (
    <li key={v.id}><ItemCard item={originals.get(v.id)!} decisions={work.decisions} doc={docs[v.file]} referenceDate={referenceDate} nudgeDays={nudgeDays}
      name={name} people={people} rowNames={rowNames} rowValues={rowValues} focusOnMount={focusId === v.id}
      onDecided={(id, a) => { if (a === "undo") { setRecent((r) => r.filter((x) => x !== id)); setFocusId(id); } }} /></li>
  );

  return (
    <>
      {!name && <p className="notice">Pick your name in Working as to confirm, correct, dismiss or close items.</p>}
      <p>Overdue first, then the nearest due date, then the longest wait.</p>
      <form className="filters" aria-label="Filter the list" onSubmit={(e) => e.preventDefault()}>
        <label>Type <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {ITEM_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select></label>
        <label>Owner <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="all">All owners</option>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select></label>
        <label>Made by <select value={madeBy} onChange={(e) => setMadeBy(e.target.value as "all" | "rule" | "ai")}>
          <option value="all">All</option>
          <option value="rule">Set by rule</option>
          <option value="ai">Found by AI</option>
        </select></label>
        <label>Due <select value={due} onChange={(e) => changeDue(e.target.value as "all" | "overdue")}>
          <option value="all">All dates</option>
          <option value="overdue">Overdue only</option>
        </select></label>
        <label className="check"><input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} /> Needs review only</label>
        {filtered && <button type="button" onClick={() => { setType("all"); setOwner("all"); setMadeBy("all"); setReview(false); changeDue("all"); }}>Clear filters</button>}
      </form>
      <p className="small" aria-live="polite">Showing {shownLive.length} of {live.length} open items.{filtered ? " A filter is on." : ""}</p>

      <section aria-labelledby="check-h">
        <h2 id="check-h" className="band-sub">Check these first ({check.filter(isLive).length})</h2>
        <p className="small">The assistant was unsure about these. Read each one against its source before you act on it.</p>
        {check.length === 0 ? <p>{checkAll.length === 0 ? "Nothing needs a check." : "No item to check matches these filters."}</p>
          : <ol className="card-list">{check.map(card)}</ol>}
      </section>

      <section aria-labelledby="rest-h">
        <h2 id="rest-h" className="band-sub">Everything else ({rest.filter(isLive).length})</h2>
        {rest.length === 0 ? <p>{restAll.length === 0 ? "Nothing else is open." : "No open item matches these filters."}</p>
          : <ol className="card-list">{rest.map(card)}</ol>}
      </section>

      <section aria-labelledby="done-h">
        <h2 id="done-h" className="band-sub">Closed and dismissed ({done.length})</h2>
        <p className="small">Closed and dismissed items no longer count. Each one can be undone.</p>
        {shownDone.length === 0 ? <p>Nothing has been closed or dismissed on this browser.</p> : <ul className="card-list">{shownDone.map(doneCard)}</ul>}
      </section>
    </>
  );
}
