// Rules applied to call 1 output. Invented companies, people and dates only.
import assert from "node:assert/strict";
import test from "node:test";
import type { CrmRow } from "../lib/crm.ts";
import { acceptOwner, buildItems, checkQuotes, dayMonthInText, followUps, lastLine, weekdayDate } from "../lib/extract.ts";
import { prepareDocument, waitingCustomers } from "../lib/pipeline.ts";
import type { Call1Result } from "../lib/prompts/call1.ts";
import type { Team } from "../lib/rules.ts";

const team: Team = { names: ["Bhavin", "Dhaval", "Karandeep", "Jay", "Pranav", "Ayush"], domain: "atliq.com" };
const row = (o: Partial<CrmRow>): CrmRow => ({
  lead_id: "", company: "", contact_name: "", contact_email: "", source: "", service_interest: "", status: "",
  est_value_usd: "", owner: "", created_date: "", last_contact_date: "", next_followup_date: "", notes: "", ...o,
});
const crm = [
  row({ lead_id: "L-9101", company: "Pellmark Tiles", contact_email: "ruth@pellmark.test", owner: "Bhavin", status: "Contacted" }),
  row({ lead_id: "L-9102", company: "Dunmore Glass", contact_email: "ed@dunmore.test", owner: "Jay", status: "Won" }),
  row({ lead_id: "L-9103", company: "Haldon Freight", contact_email: "kim@haldon.test", owner: "", status: "Proposal Sent" }),
  row({ lead_id: "L-9104", company: "Haldon Freight", contact_email: "kim@haldon.test", owner: "Dhaval", status: "New" }),
];
const ctx = { crm, team, referenceDate: "2031-03-20" };
const flags = { customer_last_message_asks: null, atliq_last_message_expects_answer: null, atliq_last_message_carries_proposal: null, needs_review: false, instruction_flagged: false };
const it = (o: Partial<Call1Result["items"][number]>): Call1Result["items"][number] =>
  ({ type: "promise", company: "Pellmark Tiles", summary: "s", quote: "", owner: null, due_text: null, due_date: null, needs_review: false, ...o });

const thread = `# Email Thread: Pellmark Tiles
**From:** Ruth Okafor <ruth@pellmark.test>
**To:** Jay <jay@atliq.com>
**Date:** 2031-03-02

Could you send the revised scope by Friday?

---
**From:** Jay <jay@atliq.com>
**To:** Ruth Okafor <ruth@pellmark.test>
**Date:** 2031-03-03

Pranav will send the revised scope by 9 March. I will also send two references.`;

test("a firm date needs its day and month in the document", () => {
  assert.equal(dayMonthInText("2031-03-09", "by 9 March"), true);
  assert.equal(dayMonthInText("2031-03-09", "by March 9th"), true);
  assert.equal(dayMonthInText("2031-03-09", "by 9/3"), true);
  assert.equal(dayMonthInText("2031-03-19", "by 9/3"), false);
  assert.equal(dayMonthInText("2031-03-15", "after the 15th"), false);
});

test("a weekday is worked out from the message date, and next Friday stays loose", () => {
  assert.equal(weekdayDate("by Friday", "2031-03-03"), "2031-03-07"); // a Monday
  assert.equal(weekdayDate("next Friday", "2031-03-03"), null);
  assert.equal(weekdayDate("mid-July", "2031-03-03"), null);
  assert.equal(weekdayDate("by Monday", "2031-03-03"), null); // same weekday is unclear
});

test("an owner must be one of the six and named in the document", () => {
  assert.equal(acceptOwner("Pranav", team, "Pranav will send it"), "Pranav");
  assert.equal(acceptOwner("Ruth", team, "Ruth will send it"), null);
  assert.equal(acceptOwner("Ayush", team, "Pranav will send it"), null);
});

test("quotes not found word for word are dropped and logged", () => {
  const d = prepareDocument("emails/2031-03-02_x.md", thread, crm, team);
  const out: Call1Result = { ...flags, items: [it({ quote: "Pranav will send the revised scope by 9 March." }), it({ quote: "Pranav will send the scope soon." })] };
  const q = checkQuotes(out, d);
  assert.equal(q.kept.length, 1);
  assert.deepEqual(q.dropped.map((x) => x.reason), ["quote_not_found"]);
});

test("items get the source owner, a CRM owner for a reply owed, a checked date and the quote's message date", () => {
  const d = prepareDocument("emails/2031-03-02_x.md", thread, crm, team);
  const items = buildItems([
    it({ quote: "Pranav will send the revised scope by 9 March.", owner: "Pranav", due_text: "by 9 March", due_date: "2031-03-09" }),
    it({ quote: "I will also send two references.", owner: "Ruth", due_date: "2031-03-11" }),
    it({ type: "reply_owed", quote: "Could you send the revised scope by Friday?", owner: "Jay" }),
  ], d, ctx);
  const [a, b, c] = items;
  assert.deepEqual([a.owner, a.owner_from, a.due_date, a.message_date, a.lead_id], ["Pranav", "source", "2031-03-09", "2031-03-03", "L-9101"]);
  assert.deepEqual([b.owner, b.owner_from, b.due_date], ["Bhavin", "crm", null]);
  assert.deepEqual([c.owner, c.owner_from, c.message_date], ["Bhavin", "crm", "2031-03-02"]);
});

// Two rows share one contact and one name, and one of them has an owner. Neither row may be used.
const twoRowThread = `# Email Thread: Haldon Freight
**From:** Kim <kim@haldon.test>
**To:** Jay <jay@atliq.com>
**Date:** 2031-03-10

Can you send the price list?

---
**From:** Jay <jay@atliq.com>
**To:** Kim <kim@haldon.test>
**Date:** 2031-03-11

Pranav will send the price list by Friday. Our estimate for both depots is attached.`;

test("two plausible rows: the item stays, the source owner and firm date stay, nothing comes from a row", () => {
  const d = prepareDocument("emails/2031-03-10_y.md", twoRowThread, crm, team);
  const [reply, promise] = buildItems([
    it({ type: "reply_owed", company: "Haldon Freight", quote: "Can you send the price list?", owner: "Jay" }),
    it({ company: "Haldon Freight", quote: "Pranav will send the price list by Friday.", owner: "Pranav", due_text: "by Friday" }),
  ], d, ctx);
  // A reply owed takes its owner from a row by rule, so it shows no owner here. Not the other row's owner either.
  assert.deepEqual([reply.owner, reply.owner_from, reply.lead_id, reply.status], ["no owner", null, null, "needs review"]);
  assert.deepEqual(reply.candidate_lead_ids, ["L-9103", "L-9104"]);
  // The source names the owner and gives a weekday, so both stand. The row match still needs review.
  assert.deepEqual([promise.owner, promise.owner_from, promise.due_date, promise.due_approx], ["Pranav", "source", "2031-03-14", false]);
  assert.deepEqual([promise.lead_id, promise.needs_review, promise.status], [null, false, "needs review"]);
  assert.deepEqual(promise.candidate_lead_ids, ["L-9103", "L-9104"]);
});

test("two plausible rows: loose words stay approximate and no owner is borrowed from a row", () => {
  const d = prepareDocument("emails/2031-03-10_y.md", twoRowThread, crm, team);
  const [i] = buildItems([it({ company: "Haldon Freight", quote: "Our estimate for both depots is attached.", due_text: "soon" })], d, ctx);
  assert.deepEqual([i.owner, i.owner_from, i.due_date, i.due_text, i.due_approx], ["no owner", null, null, "soon", true]);
});

test("two plausible rows: one waiting customer with both rows, and no stage decides a nudge", () => {
  const ask = "# Email Thread: Haldon Freight\n**From:** Kim <kim@haldon.test>\n**To:** Jay <jay@atliq.com>\n**Date:** 2031-03-10\n\nCan you send the price list?";
  const d = prepareDocument("emails/2031-03-10_w.md", ask, crm, team);
  const waiting = waitingCustomers([d, d], crm, "2031-03-20");
  assert.equal(waiting.length, 1);
  assert.deepEqual([waiting[0].lead_id, waiting[0].candidate_lead_ids, waiting[0].days_waiting], [null, ["L-9103", "L-9104"], 10]);
  // One candidate row is Won. A stage is row specific, so it does not block the nudge. The nudge needs review.
  const won = crm.map((r) => (r.lead_id === "L-9104" ? { ...r, status: "Won" } : r));
  const t = "# Email Thread: Haldon Freight\n**From:** Jay <jay@atliq.com>\n**To:** Kim <kim@haldon.test>\n**Date:** 2031-03-01\n\nOur estimate for both depots is attached for your review.";
  const d2 = prepareDocument("emails/2031-03-01_v.md", t, won, team);
  const out = { ...flags, items: [], atliq_last_message_expects_answer: true, atliq_last_message_carries_proposal: true };
  const { nudge } = followUps(d2, out, [], { ...ctx, crm: won }, 4);
  assert.deepEqual([nudge?.lead_id, nudge?.owner, nudge?.status], [null, "Jay", "needs review"]);
  assert.deepEqual(nudge?.candidate_lead_ids, ["L-9103", "L-9104"]);
});

const proposal = (status: string) => {
  const t = `# Email Thread: Pellmark Tiles
**From:** Jay <jay@atliq.com>
**To:** Ruth Okafor <ruth@pellmark.test>
**Date:** 2031-03-01

Attached is our estimate for the dashboard work, as discussed on the call.
Jay`;
  const c = crm.map((r) => (r.lead_id === "L-9101" ? { ...r, status } : r));
  return { d: prepareDocument("emails/2031-03-01_z.md", t, c, team), c };
};

test("a proposal with no reply for 4 days or more is a nudge owned by its sender", () => {
  const { d, c } = proposal("Proposal Sent");
  const out = { ...flags, items: [], atliq_last_message_expects_answer: true, atliq_last_message_carries_proposal: true };
  const { nudge, quiet } = followUps(d, out, [], { ...ctx, crm: c }, 4);
  assert.equal(quiet, null);
  assert.deepEqual([nudge?.type, nudge?.owner, nudge?.days_waiting, nudge?.lead_id], ["nudge_due", "Jay", 19, "L-9101"]);
  assert.equal(nudge?.quote, "Attached is our estimate for the dashboard work, as discussed on the call.");
});

test("no proposal means gone quiet, and a Won or Lost deal raises neither", () => {
  const { d, c } = proposal("Contacted");
  const cold = { ...flags, items: [], atliq_last_message_expects_answer: true, atliq_last_message_carries_proposal: false };
  const r = followUps(d, cold, [], { ...ctx, crm: c }, 4);
  assert.equal(r.nudge, null);
  assert.equal(r.quiet?.days_since, 19);
  const won = proposal("Won");
  const r2 = followUps(won.d, { ...cold, atliq_last_message_carries_proposal: true }, [], { ...ctx, crm: won.c }, 4);
  assert.deepEqual([r2.nudge, r2.quiet], [null, null]);
});

test("the last line skips a sign-off", () => {
  const { d } = proposal("New");
  assert.equal(lastLine(d.last!.message), "Attached is our estimate for the dashboard work, as discussed on the call.");
});

test("two items that quote the same passage are one thing owed, and a firm date carries over", async () => {
  const { mergeSamePassage, samePassage } = await import("../lib/extract.ts");
  const a = it({ type: "reply_owed", quote: "Please send the survey report by 12 May", due_text: "by 12 May" });
  const b = it({ type: "deadline", quote: "Please send the survey report by 12 May so we can book the crew", due_date: "2031-05-12" });
  const c = it({ type: "promise", quote: "Pranav will send the revised scope by 9 March." });
  const { kept, merged } = mergeSamePassage([b, c, a]); // listed in any order, the kept type is the same
  assert.deepEqual(kept.map((k) => k.type), ["reply_owed", "promise"]);
  assert.equal(kept[0].due_date, "2031-05-12");
  assert.deepEqual(merged.map((m) => [m.keptType, m.droppedType]), [["reply_owed", "deadline"]]);
  assert.equal(samePassage("Could you send the scope?", "Can we meet on Tuesday?"), false);
});

test("an email reply owed may not quote AtliQ's own words", async () => {
  const { openReplies } = await import("../lib/extract.ts");
  const t = `# Email Thread: Pellmark Tiles
**From:** Ruth <ruth@pellmark.test>
**To:** Jay <jay@atliq.com>
**Date:** 2031-03-01

Can you share the price list?

---
**From:** Jay <jay@atliq.com>
**To:** Ruth <ruth@pellmark.test>
**Date:** 2031-03-02

Here it is. Happy to walk you through it on a call.

---
**From:** Ruth <ruth@pellmark.test>
**To:** Jay <jay@atliq.com>
**Date:** 2031-03-05

Does it include delivery? And can you start in May?`;
  const d = prepareDocument("emails/2031-03-01_r.md", t, crm, team);
  const r = openReplies([
    it({ type: "reply_owed", quote: "Can you share the price list?" }),
    it({ type: "reply_owed", quote: "Happy to walk you through it on a call." }),
    it({ type: "reply_owed", quote: "Does it include delivery?" }),
    it({ type: "reply_owed", quote: "And can you start in May?" }),
    it({ type: "promise", quote: "Here it is." }),
  ], d, team);
  // Round 2: only a reply owed that quotes AtliQ's own words is removed. Answered or repeated asks stay for the model's reading.
  assert.deepEqual(r.kept.map((k) => k.quote), ["Can you share the price list?", "Does it include delivery?", "And can you start in May?", "Here it is."]);
  assert.deepEqual(r.removed.map((x) => x.reason), ["reply_owed_quotes_atliq"]);
});

test("AtliQ's own commitment in its last message stops both a nudge and gone quiet, whatever its type", () => {
  const t = "# Email Thread: Pellmark Tiles\n**From:** Jay <jay@atliq.com>\n**To:** Ruth <ruth@pellmark.test>\n**Date:** 2031-03-01\n\nOur estimate is attached. Let's do a call Thursday 6 March to walk through it.";
  const d = prepareDocument("emails/2031-03-01_c.md", t, crm, team);
  const out = { ...flags, items: [], atliq_last_message_expects_answer: true, atliq_last_message_carries_proposal: false };
  const built = buildItems([it({ type: "deadline", quote: "Let's do a call Thursday 6 March to walk through it.", due_text: "Thursday 6 March", due_date: "2031-03-06" })], d, ctx);
  assert.deepEqual(followUps(d, out, built, ctx, 4), { nudge: null, quiet: null });
});
