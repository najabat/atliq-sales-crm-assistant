"use client";
import { useEffect, useId, useRef, useState } from "react";

// Three starters, so nobody faces a blank box. Invented placeholders in brackets for the seller to replace.
const STARTERS = [
  { label: "A note after a call", text: "Call with [name] at [company] on [date]\nWhat they asked for:\nWhat we promised, and by when:\nNext step:\n" },
  { label: "A WhatsApp or iMessage text", text: "Message from [name] at [company] on [date]:\n" },
  { label: "A forwarded email", text: "From: [name] <[email]>\nTo: [AtliQ seller]\nDate: [date]\nSubject: [subject]\n\n" },
];

type Result = { kind: "off" | "wrong" | "refused" | "error"; message: string } | null;

// Quick capture. The route checks size, passcode, lockout and the daily cap, then the live switch, which is off.
// The pasted text is sent only for the length check. It is never logged, stored or shown anywhere else.
export default function CaptureView({ maxChars, dailyCap }: { maxChars: number; dailyCap: number }) {
  const uid = useId();
  const [note, setNote] = useState("");
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [used, setUsed] = useState<number | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { if (tick > 0) resultRef.current?.focus(); }, [tick]);

  const start = (text: string) => {
    setNote((n) => (n.trim() ? `${n.replace(/\s*$/, "")}\n\n${text}` : text));
    noteRef.current?.focus();
  };

  const send = async () => {
    setBusy(true);
    let r: Result;
    try {
      const res = await fetch("/api/capture", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode, note }),
      });
      const body = res.status === 401 ? null : await res.json().catch(() => null);
      if (body && typeof body.used === "number") setUsed(body.used);
      if (res.status === 401) r = { kind: "wrong", message: "That passcode is not right. Try again." };
      else if (res.status === 503) r = { kind: "off", message: body?.message ?? "The live step is not available right now. Your saved brief is unchanged." };
      else if (res.status === 413 || res.status === 429 || res.status === 400) r = { kind: "refused", message: body?.message ?? "The note was not accepted." };
      else r = { kind: "error", message: "The live step is not available right now. Your saved brief is unchanged." };
    } catch {
      // Fails closed: a network error reads the same as the switch being off.
      r = { kind: "error", message: "The live step is not available right now. Your saved brief is unchanged." };
    }
    setBusy(false);
    setResult(r);
    setTick((t) => t + 1);
  };

  const tooLong = note.length > maxChars;
  return (
    <>
      <div className="actions" role="group" aria-label="Start from">
        <span>Start from:</span>
        {STARTERS.map((s) => <button key={s.label} type="button" onClick={() => start(s.text)}>{s.label}</button>)}
      </div>
      <form className="capture-form" onSubmit={(e) => { e.preventDefault(); if (!tooLong && note.trim() && passcode) send(); }}>
        <label htmlFor={`${uid}-note`}>Paste a note, a message or an email</label>
        <textarea id={`${uid}-note`} ref={noteRef} rows={10} value={note} onChange={(e) => setNote(e.target.value)}
          aria-describedby={`${uid}-count`} spellCheck />
        <p id={`${uid}-count`} className={`small${tooLong ? " too-long" : ""}`}>
          {note.length} of {maxChars} characters.{tooLong ? " This is too long. Shorten it before you send." : ""}
        </p>
        <label htmlFor={`${uid}-pass`}>Passcode</label>
        <input id={`${uid}-pass`} type="password" autoComplete="off" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
        <div className="actions">
          <button type="submit" className="primary" disabled={busy || tooLong || !note.trim() || !passcode}>
            {busy ? "Checking…" : "Read this note"}
          </button>
          <span className="hint">{used === null ? `Up to ${dailyCap} notes a day.` : `${used} of ${dailyCap} notes used today.`}</span>
        </div>
      </form>
      <div ref={resultRef} tabIndex={-1} aria-live="polite" className="capture-result">
        {result && <p className={result.kind === "off" || result.kind === "error" ? "notice" : "notice error"}>{result.message}</p>}
        {result?.kind === "off" && <p className="small">Your note stays in the box above. It was checked for length only, not read or stored.</p>}
      </div>
    </>
  );
}
