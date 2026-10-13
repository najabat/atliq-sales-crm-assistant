// The checks in front of Quick capture. Invented passcodes, addresses and notes only.
import assert from "node:assert/strict";
import test from "node:test";
import { decide, liveSwitchOn, newGuardState, OFF_MESSAGE, passcodeMatches, pastedNoteDate, type GuardLimits } from "../lib/capture_guard.ts";

const limits: GuardLimits = { maxChars: 100, wrongTries: 5, lockoutMinutes: 15, dailyCap: 3 };
const T0 = Date.UTC(2031, 0, 1, 9, 0, 0);
const MIN = 60000;
const req = (o: Partial<{ ip: string; chars: number; passcodeOk: boolean; now: number; live: boolean }> = {}) =>
  ({ ip: "10.0.0.1", chars: 10, passcodeOk: true, now: T0, live: false, ...o });

test("the passcode compare is exact and fails closed", () => {
  assert.equal(passcodeMatches("plum-otter-41-canyon", "plum-otter-41-canyon"), true);
  assert.equal(passcodeMatches("plum-otter-41-canyo", "plum-otter-41-canyon"), false);
  assert.equal(passcodeMatches("", "plum-otter-41-canyon"), false);
  assert.equal(passcodeMatches("anything", undefined), false);
  assert.equal(passcodeMatches("anything", ""), false);
  assert.equal(passcodeMatches(42, "42"), false);
});

test("the live switch is on only for exactly true", () => {
  assert.equal(liveSwitchOn(() => true), true);
  for (const v of [false, "true", 1, null, undefined, {}]) assert.equal(liveSwitchOn(() => v), false);
  assert.equal(liveSwitchOn(() => { throw new Error("unreadable"); }), false);
});

test("order: size first, then passcode, then lockout, then the cap, then the switch", () => {
  const s = newGuardState();
  // Too long and a wrong passcode: size answers, and the wrong try is not counted.
  assert.equal(decide(s, limits, req({ chars: 101, passcodeOk: false })).status, 413);
  assert.equal(s.failures.size, 0);
  // A wrong passcode returns nothing.
  const wrong = decide(s, limits, req({ passcodeOk: false }));
  assert.deepEqual(wrong, { status: 401, body: null });
  // The right passcode reaches the switch, which is off, and the note is counted against the cap.
  const ok = decide(s, limits, req());
  assert.equal(ok.status, 503);
  assert.equal(ok.body?.message, OFF_MESSAGE);
  assert.equal(ok.body?.used, 1);
});

test("five wrong tries are answered with nothing, the sixth within 15 minutes gets a wait message", () => {
  const s = newGuardState();
  for (let i = 0; i < 5; i++) assert.deepEqual(decide(s, limits, req({ passcodeOk: false, now: T0 + i * MIN })), { status: 401, body: null });
  const sixth = decide(s, limits, req({ passcodeOk: false, now: T0 + 5 * MIN }));
  assert.equal(sixth.status, 429);
  assert.match(sixth.body!.message, /Wait 14 minutes/);
  // The right passcode does not open a locked address.
  assert.equal(decide(s, limits, req({ now: T0 + 6 * MIN })).status, 429);
  // Another address is not affected.
  assert.equal(decide(s, limits, req({ ip: "10.0.0.2", now: T0 + 6 * MIN })).status, 503);
  // After 15 minutes from the fifth wrong try the address is open again.
  assert.equal(decide(s, limits, req({ now: T0 + 4 * MIN + 15 * MIN })).status, 503);
});

test("wrong tries older than 15 minutes do not count, and a right passcode clears them", () => {
  const s = newGuardState();
  for (let i = 0; i < 4; i++) decide(s, limits, req({ passcodeOk: false, now: T0 + i * MIN }));
  assert.equal(decide(s, limits, req({ passcodeOk: false, now: T0 + 20 * MIN })).status, 401); // only 1 in the window
  decide(s, limits, req({ now: T0 + 21 * MIN }));
  for (let i = 0; i < 4; i++) assert.equal(decide(s, limits, req({ passcodeOk: false, now: T0 + 22 * MIN + i })).status, 401);
  assert.equal(decide(s, limits, req({ now: T0 + 23 * MIN })).status, 503);
});

test("the daily cap refuses the note after the cap and starts again the next day", () => {
  const s = newGuardState();
  for (let i = 1; i <= 3; i++) assert.equal(decide(s, limits, req({ now: T0 + i })).body?.used, i);
  const over = decide(s, limits, req({ now: T0 + 10 }));
  assert.equal(over.status, 429);
  assert.match(over.body!.message, /limit of 3 notes/);
  assert.equal(decide(s, limits, req({ now: T0 + 24 * 60 * MIN })).status, 503);
});

test("a switch that reads on still calls no model in this build", () => {
  const out = decide(newGuardState(), limits, req({ live: true }));
  assert.equal(out.status, 503);
  assert.equal(out.body?.message, OFF_MESSAGE);
});

test("a pasted note takes the dataset date unless it states its own", () => {
  assert.equal(pastedNoteDate("Call with Ines at Larkfield Bakery. They want a quote.", "2031-07-10"), "2031-07-10");
  assert.equal(pastedNoteDate("Notes from 2031-06-02 call", "2031-07-10"), "2031-06-02");
  assert.equal(pastedNoteDate("Date: 3 June 2031\nThey asked for a demo.", "2031-07-10"), "2031-06-03");
  assert.equal(pastedNoteDate("We spoke on Monday about the 3 dashboards.", "2031-07-10"), "2031-07-10");
});
