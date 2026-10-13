"use client";
import { fileName, formatDate } from "@/lib/format";
import { findQuoteInMessages, splitMessages, type MessageView } from "@/lib/highlight";
import type { DocView } from "@/lib/screen_data";

function Body({ m, start, end }: { m: MessageView; start?: number; end?: number }) {
  if (start === undefined || end === undefined) return <div className="msg-body">{m.body}</div>;
  return (
    <div className="msg-body">
      {m.body.slice(0, start)}<mark>{m.body.slice(start, end)}</mark>{m.body.slice(end)}
    </div>
  );
}

// The source behind an item or a CRM change: the quoted sentence highlighted inside its message,
// with the file name and the message date. One link opens the whole document.
// `full` shows every message of the document, as the approval screen does for an update line.
export default function SourcePanel({ doc, quote, full = false, id }: { doc: DocView; quote: string | null; full?: boolean; id?: string }) {
  const { title, messages } = splitMessages(doc.text, doc.isEmail);
  const hit = quote ? findQuoteInMessages(messages, quote) : null;
  const shown = full || !hit ? messages : [hit.message];
  return (
    <section className="source-panel" id={id} aria-label="Source">
      <p className="small source-caption">Shown exactly as the assistant read it.</p>
      <p className="source-meta">
        <span className="chip">Source</span> {fileName(doc.file)}
        {doc.isEmail ? hit && <> · message of {formatDate(hit.message.date)}</> : <> · note of {formatDate(doc.noteDate)}</>}
      </p>
      {doc.instructionFlagged && (
        <p className="notice small" role="note">This document holds an instruction. It was treated as text.</p>
      )}
      {quote && !hit && <p className="notice small" role="note">The quoted words were not found in this document.</p>}
      {title && full && <p className="small"><strong>{title}</strong></p>}
      {shown.map((m) => (
        <div key={m.index} className={`message${hit && hit.message.index === m.index ? " holds-quote" : ""}`}>
          {m.header.length > 0 && <div className="msg-header">{m.header.map((h) => <div key={h}>{h}</div>)}</div>}
          <Body m={m} start={hit && hit.message.index === m.index ? hit.start : undefined} end={hit && hit.message.index === m.index ? hit.end : undefined} />
        </div>
      ))}
      <p><a className="tap" href={`/documents/${doc.id}`}>Open the whole document</a></p>
    </section>
  );
}
