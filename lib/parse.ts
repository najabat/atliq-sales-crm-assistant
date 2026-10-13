// Parses an email thread or a meeting note. Works on the stripped text, so editor notes are already gone.

export interface Address {
  name: string;
  email: string;
}

export interface Message {
  index: number;
  from: Address | null;
  to: Address[];
  cc: Address[];
  date: string | null;
  subject: string | null;
  body: string;
}

export interface EmailDoc {
  kind: "email";
  file: string;
  title: string;
  titleCompany: string | null;
  messages: Message[];
}

export interface NoteDoc {
  kind: "note";
  file: string;
  title: string;
  date: string | null;
  attendees: string[] | null;
  body: string;
}

export type ParsedDoc = EmailDoc | NoteDoc;

const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// "Name <a@b.com>, Other <c@d.com>" or bare addresses.
export function parseAddresses(line: string): Address[] {
  const out: Address[] = [];
  const re = /([^,<]*?)\s*<([^>\s]+@[^>\s]+)>|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m[2]) out.push({ name: m[1].replace(/^\s*(cc|bcc)\s*:\s*/i, "").trim(), email: m[2].toLowerCase() });
    else if (m[3]) out.push({ name: "", email: m[3].toLowerCase() });
  }
  return out;
}

function headerValue(lines: string[], name: string): string | null {
  const re = new RegExp(`^\\*\\*${name}:\\*\\*\\s*(.*)$`, "i");
  for (const l of lines) {
    const m = l.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

export function parseEmail(text: string, file: string): EmailDoc {
  const titleLine = text.split(/\r?\n/).find((l) => l.startsWith("# ")) ?? "";
  const title = titleLine.replace(/^#\s*/, "").trim();
  const tm = title.match(/^(?:Email Thread|Email):\s*(.+?)\s*(?:—.*)?$/);
  const titleCompany = tm ? tm[1].trim() : null;

  const chunks = text.split(/^\s*---\s*$/m);
  const messages: Message[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/);
    const fromLine = headerValue(lines, "From");
    if (fromLine === null) continue;
    const toLine = headerValue(lines, "To") ?? "";
    const ccLine = headerValue(lines, "Cc");
    // Some To lines carry a second list after "CC:". Those addresses are copies, not recipients.
    const [toPart, ccOnTo] = toLine.split(/,?\s*\bCC:\s*/i);
    const dateLine = headerValue(lines, "Date") ?? "";
    const date = dateLine.match(ISO)?.[0] ?? null;
    const body = lines.filter((l) => !/^\*\*(From|To|Cc|Date|Subject):\*\*/i.test(l) && !l.startsWith("# ")).join("\n").trim();
    messages.push({
      index: messages.length,
      from: parseAddresses(fromLine)[0] ?? null,
      to: parseAddresses(toPart ?? ""),
      cc: [...parseAddresses(ccOnTo ?? ""), ...parseAddresses(ccLine ?? "")],
      date,
      subject: headerValue(lines, "Subject"),
      body,
    });
  }
  return { kind: "email", file, title, titleCompany, messages };
}

// "19 May", "3 Jun", "19/6", "1/7". The year comes from the file name.
export function dateFromTitle(title: string, year: string): string | null {
  const iso = title.match(ISO);
  if (iso) return iso[0];
  const pad = (n: number) => String(n).padStart(2, "0");
  const named = title.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i);
  if (named) return `${year}-${pad(MONTHS.indexOf(named[2].toLowerCase()) + 1)}-${pad(Number(named[1]))}`;
  const slash = title.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slash) {
    const d = Number(slash[1]), mo = Number(slash[2]);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return `${year}-${pad(mo)}-${pad(d)}`;
  }
  return null;
}

// A note's date is the Date line, else the date in its title, else the date in its file name.
export function parseNote(text: string, file: string): NoteDoc {
  const lines = text.split(/\r?\n/);
  const title = (lines.find((l) => l.startsWith("# ")) ?? "").replace(/^#\s*/, "").trim();
  const fileDate = (file.split(/[\\/]/).pop() ?? "").match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  const year = fileDate ? fileDate.slice(0, 4) : "";

  let date: string | null = null;
  const dateLine = lines.find((l) => /\*\*Date:\*\*/i.test(l));
  if (dateLine) date = dateLine.match(ISO)?.[0] ?? null;
  if (!date && year) date = dateFromTitle(title, year);
  if (!date) date = fileDate;

  let attendees: string[] | null = null;
  const who = lines.find((l) => /\b(attendees|present)\s*:/i.test(l));
  if (who) {
    const list = who.replace(/^.*?\b(?:attendees|present)\s*:\s*(?:\*\*)?\s*/i, "").replace(/\(.*?\)/g, "");
    attendees = list.split(/,|\+|\band\b/).map((s) => s.trim()).filter(Boolean);
  }
  return { kind: "note", file, title, date, attendees, body: text };
}

export function parseDoc(strippedText: string, file: string): ParsedDoc {
  return file.startsWith("meeting_notes/") ? parseNote(strippedText, file) : parseEmail(strippedText, file);
}
