"use client";
import { useState } from "react";
import type { CrmRow } from "@/lib/crm_schema";
import { formatDate, formatUsd, plural } from "@/lib/format";
import { northStar, openValue, waitingRows } from "@/lib/north_star";
import { addDays } from "@/lib/rules";
import type { DocView } from "@/lib/screen_data";
import type { ShownItem } from "@/lib/shown";
import { accountAnchor, changeCounts, changeView, countLine, isLive, isOverdue, itemView, needsCheck } from "@/lib/state";
import type { CrmChange, CrmFlag, GoneQuiet, WaitingCustomer } from "@/lib/types";
import { useWork } from "@/lib/useWork";
import ItemCard from "./ItemCard";
import NorthStarTile from "./NorthStarTile";

export interface BriefProps {
  waiting: WaitingCustomer[];
  items: ShownItem[];
  gone: GoneQuiet[];
  changes: CrmChange[];
  flags: CrmFlag[];
  crm: CrmRow[];
  docs: Record<string, DocView>;
  people: string[];
  referenceDate: string;
  limitDays: number;
  nudgeDays: number;
}

const TOP_ACCOUNTS = 5;

export default function BriefView(p: BriefProps) {
  const { work, name } = useWork();
  const [mine, setMine] = useState(false);
  const decisions = work.decisions;
  const rowNames = Object.fromEntries(p.crm.map((r) => [r.lead_id, r.company]));
  const rowValues = Object.fromEntries(p.crm.filter((r) => openValue(r) !== null).map((r) => [r.lead_id, formatUsd(openValue(r)!)]));
  const views = p.items.map((i) => itemView(i, decisions));
  const live = views.filter(isLive);
  const onlyMine = mine && !!name;
  const mineOk = (owner: string | null | undefined) => !onlyMine || owner === name;

  // Block 1. Counted the same way as the saved brief on Quick capture.
  const ns = northStar(waitingRows(p.waiting, p.items, p.crm, decisions), p.crm, p.limitDays);
  const { counted } = ns;
  const shownWait = counted.filter((r) => mineOk(r.owner));

  // Block 2. Overdue first, then the next 14 days. Only firm dates the source states.
  const firm = live.filter((v) => v.due_date && !v.due_approx && v.type !== "nudge_due" && mineOk(v.owner));
  const overdue = firm.filter((v) => isOverdue(v, p.referenceDate)).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const horizon = addDays(p.referenceDate, 14);
  const soon = firm.filter((v) => v.due_date! >= p.referenceDate && v.due_date! <= horizon).sort((a, b) => a.due_date!.localeCompare(b.due_date!));

  // Block 3. Nudges due, then threads gone quiet.
  const nudges = live.filter((v) => v.type === "nudge_due" && mineOk(v.owner)).sort((a, b) => (b.days_waiting ?? 0) - (a.days_waiting ?? 0));

  // Block 4. CRM changes still waiting for a decision, by account. The same counts and wording as the CRM screen.
  const counts = changeCounts(p.changes.map((c) => changeView(c, decisions)), p.flags);
  const byAccount = [...counts.pendingBy].sort((a, b) => b[1].n - a[1].n || a[1].company.localeCompare(b[1].company));

  // The summary cards count the whole team, like the North Star tile above them.
  const summary = [
    { href: "/owed?due=overdue", n: views.filter((v) => isOverdue(v, p.referenceDate)).length, title: "Overdue items", hint: "Open the Owed list, overdue only" },
    { href: "#b3", n: live.filter((v) => v.type === "nudge_due").length, title: "Nudges due", hint: "Go to block 3 below" },
    { href: "/owed#check-h", n: views.filter(needsCheck).length, title: "Check these first", hint: "Items the assistant was unsure about" },
    { href: "/crm", n: counts.pending, title: "CRM changes waiting", hint: "Open CRM changes" },
  ];

  const originals = new Map(p.items.map((i) => [i.id, i]));
  const card = (v: ShownItem) => (
    <li key={v.id}><ItemCard item={originals.get(v.id)!} decisions={decisions} doc={p.docs[v.file]} referenceDate={p.referenceDate} name={name}
      nudgeDays={p.nudgeDays} people={p.people} rowNames={rowNames} rowValues={rowValues} compact /></li>
  );

  return (
    <>
      <NorthStarTile ns={ns} limitDays={p.limitDays} wholeTeamNote={onlyMine} />

      <nav aria-label="Summary" className="summary-cards">
        <ul>{summary.map((s) => (
          <li key={s.title}>
            <a className="summary-card" href={s.href}>
              <span className="summary-n">{s.n}</span>
              <span className="summary-title">{s.title}</span>
              <span className="summary-hint">{s.hint}</span>
            </a>
          </li>
        ))}</ul>
      </nav>

      <fieldset className="switch">
        <legend>Show</legend>
        <label><input type="radio" name="scope" checked={!onlyMine} onChange={() => setMine(false)} /> Everyone</label>
        <label><input type="radio" name="scope" checked={onlyMine} disabled={!name} onChange={() => setMine(true)} /> Mine{name ? ` (${name})` : ""}</label>
        {!name && <span className="hint">Pick your name in Working as to see only yours.</span>}
      </fieldset>


      <section aria-labelledby="b1">
        <h2 id="b1" className="band-sub">1. Customers waiting</h2>
        <p className="small">Longest wait first.{onlyMine ? ` Only customers whose deal owner is ${name}.` : ""}</p>
        {shownWait.length === 0 ? <p>{onlyMine && counted.length > 0 ? `None of the waiting customers has ${name} as deal owner.` : "No customer is waiting for a reply."}</p> : (
          <div className="table-wrap">
            <table className="stack-table">
              <thead><tr><th scope="col">Company</th><th scope="col">What they asked</th><th scope="col" className="nowrap">Days waiting</th><th scope="col">Owner</th><th scope="col" className="nowrap">CRM value</th></tr></thead>
              <tbody>
                {shownWait.map(({ w, row, two, asked, owner, value }) => (
                  <tr key={`${w.lead_id ?? w.account}-${w.file}`}>
                    <td data-label="Company">{w.account}{!row && !two && <span className="chip amber">not in the CRM</span>}
                      {two && <span className="chip amber">two CRM rows, possible double entry</span>}</td>
                    <td data-label="What they asked">{asked ?? "No summary was found."}</td>
                    <td data-label="Days waiting">{w.days_waiting}{w.days_waiting > p.limitDays && <span className="verdict"><span className="chip red">over {p.limitDays} days</span></span>}</td>
                    <td data-label="Owner">{owner ? <>{owner}<span className="chip">deal owner</span></> : <span className="chip amber">no owner</span>}</td>
                    <td data-label="CRM value" className="nowrap">{value !== null ? formatUsd(value) : two ? "not taken from either row" : "not stated"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="b2">
        <h2 id="b2" className="band-sub">2. Due and overdue</h2>
        <p className="small">Overdue first, then the next 14 days, up to {formatDate(horizon)}. Only dates the source states.</p>
        {overdue.length + soon.length === 0 ? <p>Nothing is due in the next 14 days.</p> : (
          <ul className="card-list">{[...overdue, ...soon].map(card)}</ul>
        )}
      </section>

      <section aria-labelledby="b3">
        <h2 id="b3" className="band-sub">3. Nudges due</h2>
        <p className="small">A nudge is due when AtliQ sent a proposal, quote, estimate or approach note and got no reply for {p.nudgeDays} days.</p>
        {nudges.length === 0 ? <p>No nudges are due.</p> : <ul className="card-list">{nudges.map(card)}</ul>}
        <h3>Gone quiet</h3>
        <p className="small">AtliQ wrote last and no proposal was sent. Your call.</p>
        {p.gone.length === 0 ? <p>No thread has gone quiet.</p> : (
          <div className="table-wrap">
            <table className="stack-table">
              <thead><tr><th scope="col">Company</th><th scope="col">Days since AtliQ wrote</th><th scope="col">AtliQ&apos;s last line</th></tr></thead>
              <tbody>{p.gone.map((g) => (
                <tr key={g.file}><td data-label="Company">{g.account}</td><td data-label="Days since AtliQ wrote">{g.days_since}</td>
                  <td data-label="AtliQ's last line">“{g.quote}” {p.docs[g.file] && <a className="tap" href={`/documents/${p.docs[g.file].id}`}>Open the thread</a>}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="b4">
        <h2 id="b4" className="band-sub">4. CRM changes to approve</h2>
        <p>{countLine(counts)}</p>
        {byAccount.length > 0 && (
          <ul className="flags">{byAccount.slice(0, TOP_ACCOUNTS).map(([key, e]) => (
            <li key={key}><a className="tap" href={`/crm#${accountAnchor(key)}`}>{e.company}{e.lead ? ` (${e.lead})` : ""}</a>: {plural(e.n, "change", "changes")}</li>
          ))}</ul>
        )}
        {byAccount.length > TOP_ACCOUNTS && <p className="small">And {plural(byAccount.length - TOP_ACCOUNTS, "more account", "more accounts")} on the CRM changes screen.</p>}
        <p><a className="button-link" href="/crm">Review CRM changes</a></p>
      </section>
    </>
  );
}
