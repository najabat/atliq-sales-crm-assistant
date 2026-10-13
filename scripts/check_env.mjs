// Prints `set` or `not set` for each secret name in .env.local. Never prints a value.
// Run with `npm run env:check`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAMES = ["APP_PASSCODE", "ANTHROPIC_API_KEY"];
const file = path.join(ROOT, ".env.local");

const present = new Set();
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[2].replace(/^["']|["']$/g, "").trim() !== "") present.add(m[1]);
  }
} else {
  console.log(".env.local: missing");
}
for (const name of NAMES) console.log(`${name}: ${present.has(name) ? "set" : "not set"}`);
