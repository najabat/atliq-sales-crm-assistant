// The checks in front of Quick capture. Server only. Pure functions over a small in-memory state, so tests can pass the clock.
// Order: size, passcode, lockout, daily cap, then the live switch. Nothing here logs the passcode or the pasted text.
// The counts live in server memory, so each server copy keeps its own (D6). A restart clears them.
import { createHash, timingSafeEqual } from "node:crypto";

export interface GuardLimits {
  maxChars: number; // the longest note accepted
  wrongTries: number; // wrong passcodes allowed from one address before it is refused
  lockoutMinutes: number;
  dailyCap: number; // notes a day that pass the passcode, per server copy
}

export interface GuardState {
  failures: Map<string, number[]>; // address to the times of its recent wrong tries
  lockedUntil: Map<string, number>; // address to the time its lockout ends
  day: string; // the day the cap counts, in UTC. A rate limit, not a day count on the data
  used: number;
}

export const newGuardState = (): GuardState => ({ failures: new Map(), lockedUntil: new Map(), day: "", used: 0 });

export const OFF_MESSAGE = "The live step is not available right now. Your saved brief is unchanged.";

export interface Outcome {
  status: number;
  body: { message: string; used?: number; cap?: number } | null; // null: the response carries nothing
}

// Constant time. Both sides are hashed first, so the compare does not depend on the length of either.
// A missing passcode on the server fails closed: nothing matches.
export function passcodeMatches(given: unknown, expected: string | undefined): boolean {
  if (!expected || typeof given !== "string") return false;
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

// The live switch is on only when the config says exactly true. Missing, unreadable or anything else is off.
export function liveSwitchOn(read: () => unknown): boolean {
  try { return read() === true; } catch { return false; }
}

const minutesLeft = (until: number, now: number) => Math.max(1, Math.ceil((until - now) / 60000));
const waitMessage = (until: number, now: number) => {
  const m = minutesLeft(until, now);
  return `Too many wrong passcodes from this address. Wait ${m} ${m === 1 ? "minute" : "minutes"} and try again.`;
};

export function decide(state: GuardState, limits: GuardLimits,
  req: { ip: string; chars: number; passcodeOk: boolean; now: number; live: boolean }): Outcome {
  const { ip, now } = req;
  const window = limits.lockoutMinutes * 60000;
  const locked = (state.lockedUntil.get(ip) ?? 0) > now;

  // 1. Size.
  if (req.chars > limits.maxChars) {
    return { status: 413, body: { message: `This note is too long. The limit is ${limits.maxChars} characters.` } };
  }

  // 2. Passcode. A wrong one returns nothing. The wrong try is counted, and the last allowed one starts the lockout.
  if (!req.passcodeOk) {
    if (locked) return { status: 429, body: { message: waitMessage(state.lockedUntil.get(ip)!, now) } };
    const recent = (state.failures.get(ip) ?? []).filter((t) => now - t < window);
    recent.push(now);
    state.failures.set(ip, recent);
    if (recent.length >= limits.wrongTries) state.lockedUntil.set(ip, now + window);
    return { status: 401, body: null };
  }

  // 3. Lockout. The right passcode does not open an address that is locked out.
  if (locked) return { status: 429, body: { message: waitMessage(state.lockedUntil.get(ip)!, now) } };
  state.failures.delete(ip);
  state.lockedUntil.delete(ip);

  // 4. Daily cap.
  const day = new Date(now).toISOString().slice(0, 10);
  if (state.day !== day) { state.day = day; state.used = 0; }
  if (state.used >= limits.dailyCap) {
    return { status: 429, body: { message: `Today's limit of ${limits.dailyCap} notes is used. Try again tomorrow.`, used: state.used, cap: limits.dailyCap } };
  }
  state.used++;

  // 5. The live switch. Off in this build (D23). Even when it reads on, this build has no model on the site,
  // so the answer is the same. The pilot wires the pipeline in here.
  return { status: 503, body: { message: OFF_MESSAGE, used: state.used, cap: limits.dailyCap } };
}

// A pasted note is dated with the dataset date unless it states its own date (D8).
// A stated date is an ISO date or a "Date:" line with a day, a month name and a year.
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function pastedNoteDate(text: string, referenceDate: string): string {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const line = text.split(/\r?\n/).find((l) => /^\s*\**date:?\**/i.test(l));
  const m = line?.match(/\b(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})\b/);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (month >= 0) return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return referenceDate;
}
