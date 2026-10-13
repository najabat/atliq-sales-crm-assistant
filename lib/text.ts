// Text helpers ported from eval/lib.mjs without changing what they do.
// tests/text.test.ts checks the port against the original on every document.

// Editor notes are the italic lines in brackets. They are the answer key. The model never sees them.
export function stripEditorNotes(text: string): string {
  return text.replace(/\*\([\s\S]*?\)\*/g, "");
}

// The title line of an email file is cut after the company name. Meeting notes keep their title.
export function stripEmailTitleHint(text: string, file: string): string {
  const base = file.split(/[\\/]/).pop() ?? file;
  if (!file.startsWith("emails/") && !/^T\d_/.test(base)) return text;
  return text.replace(/^# (Email Thread|Email): ([^\n—]*?)\s+—[^\n]*/, "# $1: $2");
}

export function modelInput(text: string, file: string): string {
  return stripEmailTitleHint(stripEditorNotes(text), file);
}

// Word for word, after evening out only spaces, dash shapes, quote shapes and markdown stars.
export function norm(s: unknown): string {
  return String(s ?? "")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‒–—―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// The quote check. A quote counts only when it sits word for word in the text the model saw.
export function quoteFoundIn(quote: string, strippedText: string): boolean {
  const q = norm(quote);
  if (q.length < 4) return false;
  return norm(strippedText).includes(q);
}
