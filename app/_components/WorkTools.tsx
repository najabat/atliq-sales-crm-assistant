"use client";
import { useEffect, useRef, useState } from "react";
import { plural } from "@/lib/format";
import { standingCount } from "@/lib/state";
import { importWork, isWorkFile, reset } from "@/lib/store";
import { useWork } from "@/lib/useWork";

type Message = { text: string; error: boolean } | null;

// Reset this browser and Load a saved file. One panel, so one message line serves both and never goes stale.
export function WorkPanel() {
  const { work } = useWork();
  const [asking, setAsking] = useState<"reset" | "load" | null>(null);
  const [pending, setPending] = useState<{ text: string; count: number } | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const [tick, setTick] = useState(0);
  // A confirm step puts focus on Cancel, the safe choice. A result puts focus on the message.
  useEffect(() => { if (asking) cancelRef.current?.focus(); }, [asking]);
  useEffect(() => { if (tick > 0) messageRef.current?.focus(); }, [tick]);
  const say = (text: string, error = false) => { setMessage({ text, error }); setAsking(null); setPending(null); setTick((t) => t + 1); };

  const logged = work.decisions.length;
  const standing = standingCount(work.decisions);
  const load = (text: string) => {
    const r = importWork(text);
    if (r.ok) say(`Loaded. ${plural(r.decisions, "logged action is", "logged actions are")} back on this browser.`);
    else say(r.error, true);
  };
  const choose = async (f: File) => {
    const text = await f.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* checked below */ }
    if (!isWorkFile(parsed)) { load(text); return; } // importWork gives the plain refusal and changes nothing
    if (logged === 0) { load(text); return; }
    setMessage(null);
    setPending({ text, count: parsed.decisions.length });
    setAsking("load");
  };

  return (
    <div>
      <p>On this browser: {plural(standing, "decision stands", "decisions stand")} now. {plural(logged, "action is", "actions are")} logged, undos included. {plural(work.notes.length, "note is", "notes are")} captured.</p>
      {asking === "reset" ? (
        <div className="actions" role="group" aria-label="Confirm reset">
          <span>This clears every decision and note stored here. Download the work file first if you want to keep them.</span>
          <button type="button" className="danger" onClick={() => { reset(); say("This browser is reset. It starts fresh."); }}>Yes, clear everything</button>
          <button type="button" ref={cancelRef} onClick={() => setAsking(null)}>Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => { setMessage(null); setAsking("reset"); }}>Reset this browser</button>
      )}

      <p><label htmlFor="load-file">Load a saved file</label></p>
      <input id="load-file" type="file" accept=".json,application/json" onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) await choose(f);
      }} />
      {asking === "load" && pending && (
        <div className="actions" role="group" aria-label="Confirm load">
          <span>This replaces the {plural(logged, "logged action", "logged actions")} on this browser with the {plural(pending.count, "action", "actions")} in the file.</span>
          <button type="button" className="danger" onClick={() => load(pending.text)}>Yes, load the file</button>
          <button type="button" ref={cancelRef} onClick={() => { setAsking(null); setPending(null); }}>Cancel</button>
        </div>
      )}
      <p ref={messageRef} tabIndex={-1} aria-live="polite" className={message?.error ? "notice error" : "small"}>{message?.text ?? ""}</p>
    </div>
  );
}
