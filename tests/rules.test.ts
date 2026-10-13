// Unit tests on invented data. Every company, person, address and date here is made up.
import assert from "node:assert/strict";
import test from "node:test";
import type { CrmRow } from "../lib/crm.ts";
import { matchDocument } from "../lib/match.ts";
import { dateFromTitle, parseEmail, parseNote } from "../lib/parse.ts";
import {
  comeBackDate, contactEvidence, daysBetween, doubleEntryFlags, isInternalNote, latestContact, nextStep,
  noOwnerFlags, orderItems, shouldProposeContact, whoWroteLast, type Team,
} from "../lib/rules.ts";
import type { Item } from "../lib/types.ts";

const team: Team = { names: ["Bhavin", "Dhaval", "Karandeep", "Jay", "Pranav", "Ayush"], domain: "atliq.com" };

const row = (o: Partial<CrmRow>): CrmRow => ({
  lead_id: "", company: "", contact_name: "", contact_email: "", source: "", service_interest: "", status: "",
  est_value_usd: "", owner: "", created_date: "", last_contact_date: "", next_followup_date: "", notes: "", ...o,
});

const crm: CrmRow[] = [
  row({ lead_id: "L-9001", company: "Quillmoor Analytics", contact_email: "ines@quillmoor.test", owner: "Jay", last_contact_date: "2031-03-01" }),
  row({ lead_id: "L-9002", company: "Brackenfield Mills", contact_email: "olu@brackenfield.test", owner: "" }),
  row({ lead_id: "L-9003", company: "Tamsin Ferries", contact_email: "rae@tamsinferries.test", owner: "Dhaval" }),
  row({ lead_id: "L-9004", company: "Tamsin Ferries Ltd", contact_email: "rae@tamsinferries.test", owner: "Bhavin" }),
  row({ lead_id: "L-9005", company: "Corvel Labs", contact_email: "a@corvel.test", owner: "Jay" }),
  row({ lead_id: "L-9006", company: "Corvel Labs Group", contact_email: "b@corvel.test", owner: "" }),
  row({ lead_id: "L-9007", company: "Nettlewood Bank", contact_email: "x@gmail.com", owner: "Jay" }),
  row({ lead_id: "L-9008", company: "Ashgrove Retail", contact_email: "y@gmail.com", owner: "Jay" }),
];

const thread = [
  "# Email Thread: Quillmoor Analytics",
  "**From:** Jay <jay@atliq.com>",
  "**To:** Ines Moor <ines@quillmoor.test>, CC: Pat Lee <pat@quillmoor.test>",
  "**Date:** 2031-03-02",
  "**Subject:** Dashboards",
  "",
  "Sending the approach note as promised.",
  "",
  "---",
  "**From:** Ines Moor <ines@quillmoor.test>",
  "**To:** Jay <jay@atliq.com>",
  "**Date:** 2031-03-04",
  "",
  "Could you share two references by Friday?",
  "",
  "---",
  "**From:** Jay <jay@atliq.com>",
  "**To:** Pranav <pranav@atliq.com>",
  "**Date:** 2031-03-05",
  "",
  "Can you pull two references for this one?",
  "",
  "---",
  "**From:** Ines Moor <ines@quillmoor.test>",
  "**To:** Jay <jay@atliq.com>",
  "**Date:** 2031-03-06",
  "**Subject:** Automatic reply",
  "",
  "AUTOMATIC REPLY: I am away until Monday.",
].join("\n");

test("parses headers, a CC list on the To line and every message", () => {
  const e = parseEmail(thread, "emails/2031-03-02_invented.md");
  assert.equal(e.messages.length, 4);
  assert.equal(e.titleCompany, "Quillmoor Analytics");
  assert.deepEqual(e.messages[0].to.map((a) => a.email), ["ines@quillmoor.test"]);
  assert.deepEqual(e.messages[0].cc.map((a) => a.email), ["pat@quillmoor.test"]);
  assert.equal(e.messages[1].date, "2031-03-04");
});

test("who wrote last skips automatic replies and internal emails", () => {
  const w = whoWroteLast(parseEmail(thread, "emails/x.md"), team);
  assert.equal(w?.from, "customer");
  assert.equal(w?.date, "2031-03-04");
});

test("AtliQ wrote last when its reply to the customer is the last outside message", () => {
  const t = thread.split("\n---\n").slice(0, 2).join("\n---\n") +
    "\n---\n**From:** Jay <jay@atliq.com>\n**To:** Ines Moor <ines@quillmoor.test>\n**Date:** 2031-03-07\n\nHere they are.";
  const w = whoWroteLast(parseEmail(t, "emails/x.md"), team);
  assert.equal(w?.from, "atliq");
  assert.equal(w?.date, "2031-03-07");
});

test("last contact counts outside messages only and is proposed only when later", () => {
  const e = parseEmail(thread, "emails/x.md");
  const m = matchDocument(e, thread, crm, team);
  assert.deepEqual(m.accounts, ["L-9001"]);
  const best = latestContact(contactEvidence(e, m.contactRows, m.addressRows, team)).get("L-9001");
  assert.equal(best?.date, "2031-03-04");
  assert.equal(shouldProposeContact("2031-03-01", "2031-03-04"), true);
  assert.equal(shouldProposeContact("2031-03-09", "2031-03-04"), false);
  assert.equal(shouldProposeContact("", "2031-03-04"), true);
});

test("a company with no CRM row becomes NEW and is never matched to another row", () => {
  const t = "# Email Thread: Wrenhallow Studio\n**From:** Kit <kit@wrenhallow.test>\n**To:** Jay <jay@atliq.com>\n**Date:** 2031-04-01\n\nHello.";
  const m = matchDocument(parseEmail(t, "emails/y.md"), t, crm, team);
  assert.deepEqual(m.accounts, ["NEW:Wrenhallow Studio"]);
});

test("one address on two rows links both and is marked unclear, nothing merged", () => {
  const t = "# Email Thread: Tamsin Ferries\n**From:** Rae <rae@tamsinferries.test>\n**To:** Jay <jay@atliq.com>\n**Date:** 2031-04-01\n\nHi.";
  const m = matchDocument(parseEmail(t, "emails/z.md"), t, crm, team);
  assert.deepEqual(m.accounts.sort(), ["L-9003", "L-9004"]);
  assert.equal(m.unclear, true);
});

test("a lead ID in a note links the note to that row", () => {
  const n = parseNote("# Brackenfield — call 3/4 (Jay)\n- they want a quote (L-9002)\n", "meeting_notes/2031-04-03_x.md");
  const m = matchDocument(n, n.body, crm, team);
  assert.deepEqual(m.accounts, ["L-9002"]);
});

test("a customer note with an unknown company in its title becomes NEW", () => {
  const n = parseNote("# call — Pellucid Farms?? 3/4\nsomeone rang about a portal\n", "meeting_notes/2031-04-03_x.md");
  assert.deepEqual(matchDocument(n, n.body, crm, team).accounts, ["NEW:Pellucid Farms"]);
});

test("internal notes are told apart from customer notes", () => {
  assert.equal(isInternalNote(parseNote("# Internal — weekly sync\n", "meeting_notes/2031-01-01_a.md"), team), true);
  assert.equal(isInternalNote(parseNote("# Debrief\n**Date:** 2031-01-01 · Present: Jay, Pranav\n", "meeting_notes/2031-01-01_b.md"), team), true);
  assert.equal(isInternalNote(parseNote("# Meeting Notes — Corvel\n**Date:** 2031-01-01 · **Attendees:** Ana Ruiz, Jay\n", "meeting_notes/2031-01-01_c.md"), team), false);
  assert.equal(isInternalNote(parseNote("# Corvel — status?\nwhere does it stand\n", "meeting_notes/2031-01-01_d.md"), team), true);
  assert.equal(isInternalNote(parseNote("# Corvel — pricing call 2/1\n", "meeting_notes/2031-01-02_e.md"), team), false);
});

test("a note date comes from the Date line, else the title, else the file name", () => {
  assert.equal(parseNote("# X\n**Date:** 2031-05-06\n", "meeting_notes/2031-05-01_a.md").date, "2031-05-06");
  assert.equal(dateFromTitle("Corvel — call 19/6", "2031"), "2031-06-19");
  assert.equal(dateFromTitle("Corvel demo — 4 May", "2031"), "2031-05-04");
  assert.equal(parseNote("# Corvel — status?\n", "meeting_notes/2031-05-01_a.md").date, "2031-05-01");
});

test("every row with an empty owner is flagged", () => {
  assert.deepEqual(noOwnerFlags(crm).map((f) => f.lead_ids[0]), ["L-9002", "L-9006"]);
});

test("double entry by shared email or shared company domain, never by a public mail domain", () => {
  const pairs = doubleEntryFlags(crm).map((f) => f.lead_ids.join("+"));
  assert.deepEqual(pairs, ["L-9003+L-9004", "L-9005+L-9006"]);
});

const item = (o: Partial<Item>): Item => ({
  id: Math.random().toString(36), file: "f", type: "promise", account: "Quillmoor Analytics", lead_id: "L-9001",
  summary: "", quote: "", message_date: "2031-03-01", owner: "Jay", owner_from: "source", due_date: null,
  due_text: null, due_approx: false, days_waiting: null, needs_review: false, status: "new", ...o,
});

test("next step is the nearest firm date on or after the reference date", () => {
  const r = nextStep([item({ due_date: "2031-03-20" }), item({ due_date: "2031-03-12" }), item({ due_date: "2031-03-01" })], "2031-03-10");
  assert.deepEqual(r, { date: "2031-03-12", overdue: false });
});

test("an account whose firm dates have all passed is overdue and gets no date", () => {
  const r = nextStep([item({ due_date: "2031-03-01" }), item({ due_date: "2031-03-05" }), item({ due_text: "mid-March", due_approx: true })], "2031-03-10");
  assert.deepEqual(r, { date: null, overdue: true });
});

test("loose dates set nothing and raise no overdue flag", () => {
  assert.deepEqual(nextStep([item({ due_text: "next month", due_approx: true })], "2031-03-10"), { date: null, overdue: false });
  assert.deepEqual(nextStep([], "2031-03-10"), { date: null, overdue: false });
});

test("a week asked for means a come-back on day 9, and a stated date wins", () => {
  // Invented note: "Give us a week to talk it over internally." written on 2031-06-02.
  assert.equal(comeBackDate("2031-06-02", 2), "2031-06-11");
  assert.equal(daysBetween("2031-06-02", "2031-06-11"), 9);
  assert.equal(comeBackDate("2031-06-02", 2, "2031-06-16"), "2031-06-16");
});

test("order is overdue first, then nearest due date, then longest wait", () => {
  const list = orderItems([
    item({ id: "wait5", type: "reply_owed", days_waiting: 5 }),
    item({ id: "due20", due_date: "2031-03-20" }),
    item({ id: "wait30", type: "reply_owed", days_waiting: 30 }),
    item({ id: "overdue", due_date: "2031-03-02" }),
    item({ id: "due12", due_date: "2031-03-12" }),
  ], "2031-03-10");
  assert.deepEqual(list.map((i) => i.id), ["overdue", "due12", "due20", "wait30", "wait5"]);
});

test("a call note counts as contact only for the company it was with, not for a row it mentions", () => {
  const body = "# Meeting Notes — Corvel Labs\n**Date:** 2031-03-08 · **Attendees:** Ana Ruiz, Jay\n- Ana referred us to Quillmoor (L-9001).\n";
  const n = parseNote(body, "meeting_notes/2031-03-08_x.md");
  const m = matchDocument(n, body, crm, team);
  assert.ok(m.accounts.includes("L-9001"));
  const rows = contactEvidence(n, m.contactRows, m.addressRows, team).map((e) => e.leadId);
  assert.ok(rows.includes("L-9005") && !rows.includes("L-9001"));
});

test("a last contact date from an address on two rows is proposed for both and names both rows", async () => {
  const { ruleChanges, prepareDocument } = await import("../lib/pipeline.ts");
  const t = "# Email Thread: Tamsin Ferries\n**From:** Rae <rae@tamsinferries.test>\n**To:** Jay <jay@atliq.com>\n**Date:** 2031-04-01\n\nHi.";
  const d = prepareDocument("emails/2031-04-01_q.md", t, crm, team);
  const changes = ruleChanges([d], crm).filter((c) => c.lead_id === "L-9003" || c.lead_id === "L-9004");
  assert.equal(changes.length, 2);
  for (const c of changes) assert.deepEqual([c.proposed, c.candidate_lead_ids], ["2031-04-01", ["L-9003", "L-9004"]]);
});

test("a lead ID pins a same-name pair to one row, and same-name rows are marked ambiguous otherwise", () => {
  const twins: CrmRow[] = [
    row({ lead_id: "L-9201", company: "Orrin Health", contact_email: "a@orrin.test" }),
    row({ lead_id: "L-9202", company: "Orrin Health LLC", contact_email: "b@orrin.test" }),
  ];
  const pinned = "# Internal — weekly sync\n- Orrin (L-9201) still waits for our answers.\n";
  const m1 = matchDocument(parseNote(pinned, "meeting_notes/2031-02-01_a.md"), pinned, twins, team);
  assert.deepEqual([m1.accounts, m1.ambiguousRows], [["L-9201"], []]);
  const loose = "# Internal — weekly sync\n- Orrin still waits for our answers.\n";
  const m2 = matchDocument(parseNote(loose, "meeting_notes/2031-02-01_b.md"), loose, twins, team);
  assert.deepEqual([m2.accounts.sort(), m2.ambiguousRows.sort()], [["L-9201", "L-9202"], ["L-9201", "L-9202"]]);
});
