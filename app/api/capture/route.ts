// Quick capture. Checks in this order: size, passcode, lockout, daily cap, then the live switch.
// The switch is off in this build (D23), so no request ever reaches a model. Nothing from the request is logged or kept:
// not the passcode and not the pasted text. Only the length of the note is used.
import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { decide, liveSwitchOn, newGuardState, OFF_MESSAGE, passcodeMatches, type GuardLimits } from "@/lib/capture_guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Only the capture settings are read, at request time, so no other config text is bundled into the site.
// If the file cannot be read or a number is missing, the route fails closed with the off message.
type Modes = { live_processing?: unknown; live_max_paste_characters: number; passcode_wrong_tries_before_lockout: number;
  passcode_lockout_minutes: number; live_max_documents_per_day: number };
function readModes(): Modes | null {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), "config", "assistant.config.json"), "utf8")).runtime_modes as Modes;
    const nums = [m.live_max_paste_characters, m.passcode_wrong_tries_before_lockout, m.passcode_lockout_minutes, m.live_max_documents_per_day];
    return nums.every((n) => Number.isInteger(n) && n > 0) ? m : null;
  } catch { return null; }
}

// One state per server copy, kept in memory (D6).
const state = newGuardState();

const reply = (status: number, body: object | null) =>
  new NextResponse(body ? JSON.stringify(body) : null, {
    status, headers: { "Cache-Control": "no-store", ...(body ? { "Content-Type": "application/json" } : {}) },
  });

function clientAddress(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  const modes = readModes();
  if (!modes) return reply(503, { message: OFF_MESSAGE });
  const limits: GuardLimits = {
    maxChars: modes.live_max_paste_characters,
    wrongTries: modes.passcode_wrong_tries_before_lockout,
    lockoutMinutes: modes.passcode_lockout_minutes,
    dailyCap: modes.live_max_documents_per_day,
  };
  // Generous room for the JSON around the note. A body larger than this is refused before it is read.
  const maxBodyBytes = limits.maxChars * 4 + 4096;
  const tooLong = { message: `This note is too long. The limit is ${limits.maxChars} characters.` };
  if (Number(req.headers.get("content-length") ?? 0) > maxBodyBytes) return reply(413, tooLong);
  const raw = await req.text();
  if (raw.length > maxBodyBytes) return reply(413, tooLong);
  let body: { passcode?: unknown; note?: unknown };
  try { body = JSON.parse(raw); } catch { return reply(400, { message: "This request could not be read." }); }
  const note = typeof body.note === "string" ? body.note : "";

  const out = decide(state, limits, {
    ip: clientAddress(req),
    chars: note.length,
    passcodeOk: passcodeMatches(body.passcode, process.env.APP_PASSCODE),
    now: Date.now(),
    live: liveSwitchOn(() => modes.live_processing),
  });
  return reply(out.status, out.body);
}
