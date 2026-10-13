// A rule-made Reply owed card for each waiting customer that has no Reply owed item.
// The waiting list is built by code rules. When the model filed the customer's request under another type,
// the customer still waits, so the screens add one card a seller can close. Built at build time. No model call.
// The quote is the customer's last line, word for word. If it cannot be found in the text, no card is made.
import { createHash } from "node:crypto";
import type { CrmRow } from "./crm.ts";
import { locateQuote } from "./highlight.ts";
import { parseEmail, type Message } from "./parse.ts";
import { isAtliqAddress } from "./rules.ts";
import { RULE_REPLY_SUMMARY, type ShownItem } from "./shown.ts";
import { norm } from "./text.ts";
import type { Item, WaitingCustomer } from "./types.ts";

// The same id as stableId in lib/pipeline.ts, which reads the dataset folder and so cannot be imported by a screen.
// tests/rule_cards.test.ts checks the two are equal.
export const cardId = (...parts: string[]): string =>
  createHash("sha1").update(parts.join("␟")).digest("hex").slice(0, 16);

// The customer's last line that reads as a sentence, so a greeting, a sign-off or a signature is never the quote.
export function customerLastLine(m: Message): string | null {
  const lines = m.body.split(/\r?\n/).map((l) => l.trim())
    .filter((l) => l.length >= 20 && /[.?!]["'”’)]?$/.test(l) && !/^(thanks|thank you|regards|best|cheers)\b/i.test(l));
  return lines.at(-1) ?? null;
}

export function ruleReplies(waiting: WaitingCustomer[], items: Item[], docText: (file: string) => string | null,
  crm: CrmRow[], domain: string): ShownItem[] {
  const out: ShownItem[] = [];
  for (const w of waiting) {
    const covered = items.some((v) => v.type === "reply_owed" && v.file === w.file && (v.lead_id === w.lead_id || v.account === w.account));
    if (covered || !w.file.startsWith("emails/")) continue;
    const text = docText(w.file);
    if (!text) continue;
    const fromCustomer = parseEmail(text, w.file).messages
      .filter((m) => m.from && !isAtliqAddress(m.from.email, { names: [], domain }) && m.date === w.last_customer_message_date);
    const msg = fromCustomer.at(-1);
    const quote = msg ? customerLastLine(msg) : null;
    if (!quote || !locateQuote(text, quote)) continue;
    const two = (w.candidate_lead_ids?.length ?? 0) > 1;
    const owner = !two && w.lead_id ? crm.find((r) => r.lead_id === w.lead_id)?.owner || null : null;
    out.push({
      id: cardId(w.file, "reply_owed", norm(quote)), file: w.file, type: "reply_owed", account: w.account, lead_id: w.lead_id,
      summary: RULE_REPLY_SUMMARY, quote, message_date: w.last_customer_message_date,
      owner: owner ?? "no owner", owner_from: owner ? "crm" : null, due_date: null, due_text: null, due_approx: false,
      days_waiting: w.days_waiting, needs_review: false, status: two ? "needs review" : "new", rule_made: true,
      ...(two ? { candidate_lead_ids: w.candidate_lead_ids } : {}),
    });
  }
  return out;
}
