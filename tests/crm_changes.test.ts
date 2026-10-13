// Checks on call 2 output. Invented companies, people, figures and dates only.
import assert from "node:assert/strict";
import test from "node:test";
import { buildCrmChanges, nextStepChanges, notesSupported, statedValue } from "../lib/crm_changes.ts";
import type { CrmRow } from "../lib/crm.ts";
import { prepareDocument } from "../lib/pipeline.ts";
import type { Team } from "../lib/rules.ts";
import type { Item } from "../lib/types.ts";

const team: Team = { names: ["Bhavin", "Dhaval", "Karandeep", "Jay", "Pranav", "Ayush"], domain: "atliq.com" };
const row = (o: Partial<CrmRow>): CrmRow => ({
  lead_id: "L-9301", company: "Brisk Mills", contact_name: "", contact_email: "noor@brisk.test", source: "Website", service_interest: "",
  status: "Contacted", est_value_usd: "", owner: "Jay", created_date: "", last_contact_date: "", next_followup_date: "", notes: "", ...o,
});
const ctx = { sellers: ["Bhavin", "Dhaval", "Karandeep", "Jay"], sources: ["Cold Outreach", "Conference", "LinkedIn", "Referral", "Website"], services: ["Dashboards", "Data Engineering"], domain: "atliq.com" };
const thread = `# Email Thread: Brisk Mills
**From:** Noor <noor@brisk.test>
**To:** Jay <jay@atliq.com>
**Date:** 2031-05-02

Thanks for the proposal. Leadership approved 42k for the stock dashboards. A second phase could be 10-15k later.`;
const doc = prepareDocument("emails/2031-05-02_b.md", thread, [row({})], team);
const none = { changes: [], conflicts: [], closed_items: [], new_row: null };

test("a value is one stated figure, never a range or a figure the quote does not hold", () => {
  assert.equal(statedValue("42000", "Leadership approved 42k for the stock dashboards."), "42000");
  assert.equal(statedValue("12500", "A second phase could be 10-15k later."), null);
  assert.equal(statedValue("50000", "Leadership approved 42k for the stock dashboards."), null);
});

test("a notes line may not claim an outcome or a figure the source does not hold", () => {
  assert.equal(notesSupported("Proposal received well. Budget of 42k approved.", thread), true);
  assert.equal(notesSupported("Contract signed and paid.", thread), false);
  assert.equal(notesSupported("Budget of 90k approved.", thread), false);
});

test("changes need a quote found in the cited file, a valid stage and a seller named in the quote", () => {
  const out = { ...none, changes: [
    { field: "status" as const, proposed: "proposal sent", quote: "Thanks for the proposal.", file: doc.file },
    { field: "est_value_usd" as const, proposed: "42000", quote: "Leadership approved 42k for the stock dashboards.", file: doc.file },
    { field: "owner" as const, proposed: "Dhaval", quote: "Thanks for the proposal.", file: doc.file },
    { field: "notes" as const, proposed: "Deal won.", quote: "Thanks for the proposal.", file: doc.file },
    { field: "service_interest" as const, proposed: "Dashboards", quote: "We want a data lake.", file: doc.file },
  ] };
  const r = buildCrmChanges(out, row({}), null, [doc], ctx);
  assert.deepEqual(r.changes.map((c) => [c.field, c.proposed]), [["status", "Proposal Sent"], ["est_value_usd", "42000"]]);
  assert.deepEqual(r.dropped.map((d) => d.reason).sort(), ["quote_not_found", "unsupported_notes", "unsupported_owner"]);
});

test("a conflict becomes a flag with both sides, and no stage is proposed with it", () => {
  const out = { ...none, conflicts: [{ crm_says: "Contacted since April.", evidence_says: "Customer approved budget on 2 May.", quote: "Leadership approved 42k for the stock dashboards.", file: doc.file }] };
  const r = buildCrmChanges(out, row({}), null, [doc], ctx);
  assert.equal(r.changes.length, 0);
  assert.deepEqual([r.flags[0].kind, r.flags[0].lead_ids], ["conflict", ["L-9301"]]);
});

test("a new row fills only four fields, each only as the source states it", () => {
  const t = "# Email Thread: Quarry Lane\n**From:** Ida Moss <ida@quarrylane.test>\n**To:** Jay <jay@atliq.com>\n**Date:** 2031-05-03\n\nWe found you on your website and want a quote.";
  const d = prepareDocument("emails/2031-05-03_q.md", t, [row({})], team);
  const out = { ...none, new_row: { company: "Quarry Lane", contact_name: "Ida Moss", contact_email: "boss@quarrylane.test", source: "Website", quote: "We found you on your website and want a quote.", file: d.file } };
  const [c] = buildCrmChanges(out, null, "Quarry Lane", [d], ctx).changes;
  assert.deepEqual(c.proposed, { company: "Quarry Lane", contact_name: "Ida Moss", contact_email: null, source: "Website" });
  assert.equal(c.lead_id, null);
});

const it = (o: Partial<Item>): Item => ({ id: "x", file: "f", type: "promise", account: "Brisk Mills", lead_id: "L-9301", summary: "", quote: "q",
  message_date: "2031-05-01", owner: "Jay", owner_from: "source", due_date: null, due_text: null, due_approx: false, days_waiting: null,
  needs_review: false, status: "new", ...o });

test("the next step date is the nearest firm date ahead, and all firm dates passed gives an overdue flag", () => {
  const ahead = nextStepChanges([row({})], [it({ due_date: "2031-05-20" }), it({ due_date: "2031-05-12" })], "2031-05-10");
  assert.deepEqual([ahead.changes[0].proposed, ahead.flags.length], ["2031-05-12", 0]);
  const late = nextStepChanges([row({})], [it({ due_date: "2031-05-01" }), it({ due_text: "soon", due_approx: true })], "2031-05-10");
  assert.deepEqual([late.changes.length, late.flags[0].kind], [0, "overdue"]);
  const loose = nextStepChanges([row({})], [it({ due_text: "soon", due_approx: true })], "2031-05-10");
  assert.deepEqual([loose.changes.length, loose.flags.length], [0, 0]);
});

test("round 1 checks: a dollar figure keeps its written form, an owner needs ownership words, a service comes from the CRM's list", () => {
  assert.equal(notesSupported("Budget of $42k approved.", thread), false); // the source writes 42k, not $42k
  assert.equal(notesSupported("Budget of 42k approved.", thread), true);
  const t = "# Email Thread: Brisk Mills\n**From:** Dhaval <dhaval@atliq.com>\n**To:** Noor <noor@brisk.test>\n**Date:** 2031-05-04\n\nDhaval will own this deal from now on. We will scope the dashboards next week.";
  const d = prepareDocument("emails/2031-05-04_o.md", t, [row({})], team);
  const r = buildCrmChanges({ ...none, changes: [
    { field: "owner", proposed: "Dhaval", quote: "Dhaval will own this deal from now on.", file: d.file },
    { field: "service_interest", proposed: "Dashboards", quote: "We will scope the dashboards next week.", file: d.file },
  ] }, row({}), null, [d], ctx);
  assert.deepEqual(r.changes.map((c) => [c.field, c.proposed]), [["owner", "Dhaval"], ["service_interest", "Dashboards"]]);
  const r2 = buildCrmChanges({ ...none, changes: [
    { field: "owner", proposed: "Dhaval", quote: "Dhaval will own this deal from now on.".replace("own this deal", "call you"), file: d.file },
    { field: "service_interest", proposed: "Stock dashboards", quote: "We will scope the dashboards next week.", file: d.file },
  ] }, row({}), null, [d], ctx);
  assert.equal(r2.changes.length, 0);
});

test("stage rules: open stages move forward only, Won never moves back, Lost reopens only on a later customer message", async () => {
  const { stageDecision } = await import("../lib/crm_changes.ts");
  const t = `# Email Thread: Brisk Mills
**From:** Jay <jay@atliq.com>
**To:** Noor <noor@brisk.test>
**Date:** 2031-06-01

Checking in after the winter.

---
**From:** Noor <noor@brisk.test>
**To:** Jay <jay@atliq.com>
**Date:** 2031-06-03

We want to restart the dashboard project now. Can we talk next week?`;
  const d = prepareDocument("emails/2031-06-01_s.md", t, [row({})], team);
  const restart = "We want to restart the dashboard project now.";
  const atliq = "Checking in after the winter.";
  const r = (status: string, last = "2031-01-10") => row({ status, last_contact_date: last });
  assert.equal(stageDecision("Contacted", "Proposal Sent", restart, d.file, [d], r("Contacted"), "atliq.com"), "ok");
  assert.equal(stageDecision("Proposal Sent", "Contacted", restart, d.file, [d], r("Proposal Sent"), "atliq.com"), "conflict");
  assert.equal(stageDecision("Won", "Contacted", restart, d.file, [d], r("Won"), "atliq.com"), "reject");
  assert.equal(stageDecision("Lost", "Contacted", restart, d.file, [d], r("Lost"), "atliq.com"), "ok");
  assert.equal(stageDecision("Lost", "Contacted", atliq, d.file, [d], r("Lost"), "atliq.com"), "conflict"); // AtliQ's own words
  assert.equal(stageDecision("Lost", "Contacted", restart, d.file, [d], r("Lost", "2031-07-01"), "atliq.com"), "conflict"); // not later
  assert.equal(stageDecision("Lost", "Proposal Sent", restart, d.file, [d], r("Lost"), "atliq.com"), "conflict");
});

test("a contact name the source marks as uncertain is not stated", async () => {
  const { nameMarkedUncertain } = await import("../lib/crm_changes.ts");
  assert.equal(nameMarkedUncertain("Tomas", "the buyer — Tomas? Tobias? — rang"), true);
  assert.equal(nameMarkedUncertain("Tomas Berg", "Tomas Berg rang about the order"), false);
});

test("an item counts as closed only on a quote from a later document", async () => {
  const { closedItems } = await import("../lib/crm_changes.ts");
  const later = prepareDocument("meeting_notes/2031-06-20_n.md", "# Meeting Notes — Brisk Mills, demo\n**Date:** 2031-06-20 · **Attendees:** Noor, Jay\n- Jay showed the stock dashboard demo as promised.\n", [row({})], team);
  const item = { id: "i1", file: "emails/x.md", type: "promise" as const, account: "Brisk Mills", lead_id: "L-9301", summary: "", quote: "Jay will show the stock dashboard demo next week.",
    message_date: "2031-06-03", owner: "Jay", owner_from: "source" as const, due_date: "2031-06-18", due_text: "18 June", due_approx: false,
    days_waiting: null, needs_review: false, status: "new" };
  const ok = closedItems({ ...none, closed_items: [{ item: 1, quote: "Jay showed the stock dashboard demo as promised.", file: later.file }] }, [item], [later], "atliq.com");
  assert.deepEqual(ok.ids, ["i1"]);
  const early = closedItems({ ...none, closed_items: [{ item: 1, quote: "Jay showed the stock dashboard demo as promised.", file: later.file }] },
    [{ ...item, message_date: "2031-06-25" }], [later], "atliq.com");
  assert.deepEqual([early.ids, early.dropped[0].reason], [[], "closure_not_later"]);
});

test("a service interest fills a blank field only", () => {
  const out = { ...none, changes: [{ field: "service_interest" as const, proposed: "Dashboards", quote: "Leadership approved 42k for the stock dashboards.", file: doc.file }] };
  assert.equal(buildCrmChanges(out, row({ service_interest: "Data Engineering" }), null, [doc], ctx).changes.length, 0);
  assert.equal(buildCrmChanges(out, row({}), null, [doc], ctx).changes.length, 1);
});

test("round 3: Won needs signed, paid or won in the quote, otherwise a conflict", async () => {
  const { stageDecision } = await import("../lib/crm_changes.ts");
  const r = row({ status: "Proposal Sent" });
  assert.equal(stageDecision("Proposal Sent", "Won", "Board approved the project. Please send the contract.", doc.file, [doc], r, "atliq.com"), "conflict");
  assert.equal(stageDecision("Proposal Sent", "Won", "The contract is signed and the first invoice paid.", doc.file, [doc], r, "atliq.com"), "ok");
});

test("round 3: no service interest from a document under review", () => {
  const unclearDoc = { ...doc, result: { ...doc.result, needs_review: true } };
  const out = { ...none, changes: [{ field: "service_interest" as const, proposed: "Dashboards", quote: "Leadership approved 42k for the stock dashboards.", file: doc.file }] };
  assert.equal(buildCrmChanges(out, row({}), null, [unclearDoc], ctx).changes.length, 0);
});

test("round 3: a new row's source only when the document says how the lead came in", async () => {
  const { sourceStated } = await import("../lib/crm_changes.ts");
  assert.equal(sourceStated("Referral", "Our partner referred us to you last week."), true);
  assert.equal(sourceStated("Referral", "He heard about your portal from a supplier they share."), false);
  assert.equal(sourceStated("Website", "We found you on your website."), true);
});

test("round 3: a closure needs completion words, no question and the same subject", async () => {
  const { strongClosure } = await import("../lib/crm_changes.ts");
  assert.equal(strongClosure("Can you split the fee into two stages?", "Attached is the revised fee in two stages."), true);
  assert.equal(strongClosure("What would a monitoring engagement look like?", "Shall we do a discovery call on Monday?"), false);
  assert.equal(strongClosure("Need his notes from the fair conversation.", "Finally spoke to him after the fair."), false);
  assert.equal(strongClosure("Finance head wants a payback framing per project.", "The licence framing worked for the board."), false);
});

test("3.1: conference words count inside a compound event name, and an introduction subject counts as referral", async () => {
  const { sourceStated } = await import("../lib/crm_changes.ts");
  assert.equal(sourceStated("Conference", "Good meeting you at DataWaveSummit Lisbon last week."), true);
  assert.equal(sourceStated("Conference", "We met at the FinTechExpo stand."), true);
  assert.equal(sourceStated("Referral", "**Subject:** Intro: Kestrelbay <> Orrin Labs"), true);
  // Unchanged: no stated cue, no source.
  assert.equal(sourceStated("Referral", "He heard about your portal from a supplier they share."), false);
  assert.equal(sourceStated("Conference", "Thanks for the call on Tuesday."), false);
});
