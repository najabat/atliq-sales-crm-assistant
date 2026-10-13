// The browser-side logic behind the screens. Invented companies, people, dates and quotes only.
import assert from "node:assert/strict";
import test from "node:test";
import type { CrmRow } from "../lib/crm_schema.ts";
import { CRM_COLUMNS } from "../lib/crm_schema.ts";
import { toCsv, workingCopy } from "../lib/csv.ts";
import { findQuoteInMessages, locateQuote, splitMessages } from "../lib/highlight.ts";
import { changeView, flagIdOf, isOverdue, itemView, needsCheck, standing } from "../lib/state.ts";
import { exportWork, importWork, load, reset, save, undo, type Decision, type Storage } from "../lib/store.ts";
import type { CrmChange, CrmFlag, Item } from "../lib/types.ts";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}
const d = (o: Partial<Decision>): Decision => ({ target: "t1", action: "confirm", by: "Jay", at: "2031-01-01T10:00:00Z", reason: null, old_value: null, new_value: null, ...o });

test("store: load, save, undo, export, import and reset", () => {
  const s = memoryStorage();
  reset(s);
  assert.equal(load(s).decisions.length, 0);
  save([d({ target: "a", action: "approve" }), d({ target: "b", action: "approve" })], s);
  assert.equal(load(s).decisions.length, 2);
  undo("a", "Jay", s);
  assert.deepEqual(standing(load(s).decisions, "a"), []);
  const file = exportWork(s);
  reset(s);
  assert.equal(load(s).decisions.length, 0);
  assert.deepEqual(importWork(file, s), { ok: true, decisions: 3 });
  assert.equal(standing(load(s).decisions, "b").length, 1);
});

test("store: import refuses anything that is not a work file and changes nothing", () => {
  const s = memoryStorage();
  reset(s);
  save(d({ target: "keep" }), s);
  assert.equal(importWork("not json", s).ok, false);
  assert.equal(importWork(JSON.stringify({ app: "other", version: 1, decisions: [], notes: [] }), s).ok, false);
  assert.equal(importWork(JSON.stringify({ app: "atliq-sales-crm-assistant", version: 1, decisions: [{ target: "x", action: "explode" }], notes: [] }), s).ok, false);
  assert.equal(load(s).decisions.length, 1);
});

const item = (o: Partial<Item>): Item => ({ id: "i1", file: "emails/x.md", type: "promise", account: "Quillmoor", lead_id: "L-9001", summary: "s",
  quote: "q", message_date: "2031-03-01", owner: "Jay", owner_from: "crm", due_date: "2031-03-09", due_text: "by 9 March", due_approx: false,
  days_waiting: null, needs_review: false, status: "new", ...o });

test("state: corrections, close with a reason, and undo back to the start", () => {
  const ds = [
    d({ target: "i1", action: "correct", new_value: { type: "come_back", owner: "Pranav", due_date: "2031-03-12" } }),
    d({ target: "i1", action: "close", reason: "Answered elsewhere" }),
  ];
  const v = itemView(item({}), ds);
  assert.deepEqual([v.type, v.owner, v.due_date, v.state, v.closeReason, v.corrected], ["come_back", "Pranav", "2031-03-12", "closed", "Answered elsewhere", true]);
  const back = itemView(item({}), [...ds, d({ target: "i1", action: "undo" }), d({ target: "i1", action: "undo" })]);
  assert.deepEqual([back.type, back.owner, back.state, back.corrected], ["promise", "Jay", "open", false]);
});

const crm: CrmRow[] = [
  Object.fromEntries(CRM_COLUMNS.map((k) => [k, ""])) as CrmRow,
  Object.fromEntries(CRM_COLUMNS.map((k) => [k, ""])) as CrmRow,
].map((r, i) => ({ ...r, lead_id: `L-91${i}`, company: i ? "Brisk, Mills" : "Quillmoor", status: "Contacted", notes: 'said "maybe"' }));
const change = (o: Partial<CrmChange>): CrmChange => ({ id: "c1", lead_id: "L-910", company: "Quillmoor", field: "status", current: "Contacted",
  proposed: "Proposal Sent", quote: "q", file: "f", set_by: "model", status: "proposed", ...o });

test("working copy: approved and edited changes only, 13 columns, one row per lead, new rows with four fields", () => {
  const changes = [
    change({}),
    change({ id: "c2", field: "notes", proposed: "line one" }),
    change({ id: "c3", lead_id: "L-911", company: "Brisk, Mills", field: "est_value_usd", proposed: "42000" }),
    change({ id: "c4", lead_id: null, company: "Wrenhallow", field: "new_row", proposed: { company: "Wrenhallow", contact_name: "Kit", contact_email: null, source: "Website" } }),
  ];
  const flags: CrmFlag[] = [{ kind: "no_owner", lead_ids: ["L-911"], company: "Brisk, Mills", file: null, quote: null, note: "" }];
  const ds = [d({ target: "c1", action: "approve" }), d({ target: "c2", action: "edit", new_value: "line two" }), d({ target: "c3", action: "reject" }),
    d({ target: "c4", action: "approve" }), d({ target: flagIdOf(flags[0]), action: "edit", new_value: "Dhaval" })];
  const rows = workingCopy(crm, changes, flags, ds);
  assert.equal(rows.length, 3);
  assert.deepEqual([rows[0].status, rows[0].notes, rows[1].est_value_usd, rows[1].owner], ["Proposal Sent", "line two", "", "Dhaval"]);
  assert.deepEqual([rows[2].lead_id, rows[2].company, rows[2].contact_name, rows[2].source, rows[2].status], ["", "Wrenhallow", "Kit", "Website", ""]);
  const csv = toCsv(rows).trim().split("\n");
  assert.equal(csv[0].split(",").length, 13);
  assert.equal(csv.length, 4);
  assert.ok(csv[2].includes('"Brisk, Mills"') && csv[2].includes('"said ""maybe"""'));
  assert.equal(changeView(changes[1], ds).decision, "edited");
});

test("highlight: the quote is found inside its message across dash, quote and space shapes", () => {
  const text = `# Email Thread: Quillmoor
**From:** Ines <ines@quillmoor.test>
**To:** Jay <jay@atliq.com>
**Date:** 2031-03-04

We'd like the “revised scope” — ideally   by Friday.

---
**From:** Jay <jay@atliq.com>
**To:** Ines <ines@quillmoor.test>
**Date:** 2031-03-05

**Pranav** will send it by 9 March.`;
  const { title, messages } = splitMessages(text, true);
  assert.equal(title, "Email Thread: Quillmoor");
  assert.deepEqual(messages.map((m) => m.date), ["2031-03-04", "2031-03-05"]);
  const hit = findQuoteInMessages(messages, `We'd like the "revised scope" - ideally by Friday.`);
  assert.equal(hit?.message.index, 0);
  assert.equal(hit!.message.body.slice(hit!.start, hit!.end), "We'd like the “revised scope” — ideally   by Friday.");
  const two = findQuoteInMessages(messages, "Pranav will send it by 9 March.");
  assert.equal(two?.message.index, 1);
  assert.equal(locateQuote("nothing here", "a quote that is absent"), null);
});

test("two flags of one kind on one row get different ids, so a decision on one never touches the other", () => {
  const a: CrmFlag = { kind: "conflict", lead_ids: ["L-910"], company: "Quillmoor", file: "emails/a.md", quote: "first side", note: "" };
  const b: CrmFlag = { ...a, file: "meeting_notes/b.md", quote: "second side" };
  assert.notEqual(flagIdOf(a), flagIdOf(b));
  assert.notEqual(flagIdOf(a), flagIdOf({ ...a, note: "a second reading of the same line" }));
  assert.equal(flagIdOf(a), flagIdOf({ ...a }));
});

test("approve all is one action: one undo reverses exactly that batch and nothing approved on its own", async () => {
  const { batchMark, standingBatch } = await import("../lib/state.ts");
  const ids = ["c1", "c2", "c3", "c4"];
  const one = d({ target: "c1", action: "approve", reason: null });
  const mark = batchMark("L-910", "2031-01-01T10:00:00Z");
  const batch = ["c2", "c3", "c4"].map((t) => d({ target: t, action: "approve", reason: mark }));
  // Scenario: approve one on its own, then approve all of the rest. The undo reverses only the three.
  assert.deepEqual(standingBatch([one, ...batch], ids), ["c2", "c3", "c4"]);
  const afterUndo = [one, ...batch, ...["c2", "c3", "c4"].map((t) => d({ target: t, action: "undo" }))];
  assert.deepEqual(standingBatch(afterUndo, ids), []);
  assert.deepEqual(ids.map((t) => standing(afterUndo, t).length), [1, 0, 0, 0]);
  // A card-level undo of one batch member leaves the other two in the batch, so the account undo still finds them.
  assert.deepEqual(standingBatch([one, ...batch, d({ target: "c3", action: "undo" })], ids), ["c2", "c4"]);
});

test("summary cards: overdue needs a firm past date on a live item, and a closed item leaves both counts", () => {
  const ref = "2031-05-10";
  const past = item({ id: "p", due_date: "2031-05-02", due_approx: false });
  assert.equal(isOverdue(itemView(past, []), ref), true);
  assert.equal(isOverdue(itemView(item({ id: "a", due_date: "2031-05-02", due_approx: true }), []), ref), false);
  assert.equal(isOverdue(itemView(item({ id: "f", due_date: "2031-05-20", due_approx: false }), []), ref), false);
  assert.equal(isOverdue(itemView(item({ id: "n", type: "nudge_due", due_date: "2031-05-02", due_approx: false }), []), ref), false);
  assert.equal(isOverdue(itemView(past, [d({ target: "p", action: "close", reason: "Done" })]), ref), false);
  const unsure = item({ id: "u", status: "needs review" });
  assert.equal(needsCheck(itemView(unsure, [])), true);
  assert.equal(needsCheck(itemView(unsure, [d({ target: "u", action: "dismiss" })])), false);
  assert.equal(needsCheck(itemView(item({ id: "k" }), [])), false);
});
