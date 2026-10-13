import { notFound } from "next/navigation";
import { fileName, formatDate } from "@/lib/format";
import { splitMessages } from "@/lib/highlight";
import { loadScreenData } from "@/lib/screen_data";

export const dynamicParams = false;

// Only the documents the results use, each as the model saw it with the editor notes removed.
export function generateStaticParams() {
  return Object.values(loadScreenData().docs).map((d) => ({ id: d.id }));
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = Object.values(loadScreenData().docs).find((d) => d.id === id);
  if (!doc) notFound();
  const { title, messages } = splitMessages(doc.text, doc.isEmail);
  return (
    <>
      <p><a className="tap" href="/owed">Back to the Owed list</a></p>
      <h1>{title ?? fileName(doc.file)}</h1>
      <p className="small source-caption">Shown exactly as the assistant read it.</p>
      <p className="small">{fileName(doc.file)}{!doc.isEmail && doc.noteDate ? ` · note of ${formatDate(doc.noteDate)}` : ""}</p>
      {doc.instructionFlagged && <p className="notice small" role="note">This document holds an instruction. It was treated as text.</p>}
      {messages.map((m) => (
        <div key={m.index} className="message" id={`m${m.index}`}>
          {m.header.length > 0 && <div className="msg-header">{m.header.map((h) => <div key={h}>{h}</div>)}</div>}
          <div className="msg-body">{m.body}</div>
        </div>
      ))}
    </>
  );
}
