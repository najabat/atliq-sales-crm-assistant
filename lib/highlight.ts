// Finds a quote inside the text the model saw, so the source panel can highlight it.
// It evens out the same things as the quote check: spaces, dash shapes, quote shapes and markdown stars.
// Browser safe. No node imports.

// The normalised text, with the original index of every normalised character.
function normWithMap(s: string): { n: string; map: number[] } {
  let n = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (c === "*" && s[i + 1] === "*") { i++; continue; }
    if ("‘’‛′".includes(c)) c = "'";
    else if ("“”‟″".includes(c)) c = '"';
    else if ("‒–—―−".includes(c)) c = "-";
    else if (c === " ") c = " ";
    if (/\s/.test(c)) {
      if (n.length === 0 || n[n.length - 1] === " ") continue;
      c = " ";
    }
    n += c.toLowerCase();
    map.push(i);
  }
  return { n, map };
}

const normQuote = (q: string) => normWithMap(q).n.trim();

// The start and end of the quote in the original text, or null when it is not there word for word.
export function locateQuote(text: string, quote: string): { start: number; end: number } | null {
  const q = normQuote(quote);
  if (q.length < 4) return null;
  const { n, map } = normWithMap(text);
  const at = n.indexOf(q);
  if (at < 0) return null;
  return { start: map[at], end: map[at + q.length - 1] + 1 };
}

export interface MessageView {
  index: number;
  header: string[]; // From, To, Cc, Date and Subject lines, stars removed
  date: string | null;
  body: string;
}

// An email splits into messages at lines that hold only ---. A note is one message.
export function splitMessages(text: string, isEmail: boolean): { title: string | null; messages: MessageView[] } {
  const lines = text.split(/\r?\n/);
  const titleLine = lines.find((l) => l.startsWith("# ")) ?? null;
  const title = titleLine ? titleLine.replace(/^#\s*/, "") : null;
  const withoutTitle = titleLine ? text.replace(titleLine, "") : text;
  const chunks = isEmail ? withoutTitle.split(/^\s*---\s*$/m) : [withoutTitle];
  const messages: MessageView[] = [];
  for (const chunk of chunks) {
    const header: string[] = [];
    const body: string[] = [];
    let date: string | null = null;
    for (const l of chunk.split(/\r?\n/)) {
      const h = l.match(/^\*\*(From|To|Cc|Date|Subject):\*\*\s*(.*)$/i);
      if (isEmail && h) {
        header.push(`${h[1]}: ${h[2]}`);
        if (h[1].toLowerCase() === "date") date = h[2].match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
      } else body.push(l);
    }
    const b = body.join("\n").trim();
    if (!b && !header.length) continue;
    messages.push({ index: messages.length, header, date, body: b });
  }
  return { title, messages };
}

// The message that holds the quote, and where the quote sits in its body.
export function findQuoteInMessages(messages: MessageView[], quote: string): { message: MessageView; start: number; end: number } | null {
  for (const m of messages) {
    const r = locateQuote(m.body, quote);
    if (r) return { message: m, ...r };
  }
  return null;
}
