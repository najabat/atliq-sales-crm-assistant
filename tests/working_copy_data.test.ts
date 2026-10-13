// The CRM working copy on the real files, read at run time. This file holds no company, lead ID or value.
// Skips when the dataset or the results are not on this machine.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { readCrmFile } from "../lib/crm.ts";
import { CRM_COLUMNS } from "../lib/crm_schema.ts";
import { toCsv, workingCopy } from "../lib/csv.ts";
import type { Results } from "../lib/types.ts";

const DATA = path.join(process.cwd(), "data");
const ready = fs.existsSync(path.join(DATA, "dataset", "crm_export.csv")) && fs.existsSync(path.join(DATA, "results", "current.json"));

test("with no decisions the working copy equals the export, and one approval changes one cell", { skip: !ready }, () => {
  const crm = readCrmFile(path.join(DATA, "dataset"));
  const r = JSON.parse(fs.readFileSync(path.join(DATA, "results", "current.json"), "utf8")) as Results;
  const zero = workingCopy(crm, r.crm_changes, r.crm_flags, []);
  assert.equal(zero.length, crm.length);
  assert.deepEqual(zero, crm);
  // The downloaded file itself: with no decisions it is the export, byte for byte.
  assert.equal(toCsv(zero), fs.readFileSync(path.join(DATA, "dataset", "crm_export.csv"), "utf8"));

  const change = r.crm_changes.find((c) => c.field === "next_followup_date" && c.lead_id);
  if (!change) return;
  const one = workingCopy(crm, r.crm_changes, r.crm_flags,
    [{ target: change.id, action: "approve", by: "Tester", at: "2031-01-01T00:00:00Z", reason: null, old_value: null, new_value: null }]);
  const diffs: string[] = [];
  crm.forEach((row, i) => CRM_COLUMNS.forEach((k) => { if (one[i][k] !== row[k]) diffs.push(`${row.lead_id === change.lead_id ? "same row" : "other row"} ${k}`); }));
  assert.deepEqual(diffs, ["same row next_followup_date"]);
});
