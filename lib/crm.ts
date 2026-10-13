// Reads the CRM export. The 13 columns stay in the export's own order.
import fs from "node:fs";
import path from "node:path";

import type { CrmColumn, CrmRow } from "./crm_schema.ts";
// The columns, row type and stages live in a browser-safe file. They are re-exported here unchanged.
export { CRM_COLUMNS, STAGES, isClosed } from "./crm_schema.ts";
export type { CrmColumn, CrmRow } from "./crm_schema.ts";

// Same reading as readCrm in eval/lib.mjs, so the app and the evals see the same rows.
export function parseCrm(text: string): CrmRow[] {
  const lines = text.trim().split(/\r?\n/);
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  const head = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row = {} as CrmRow;
    head.forEach((h, i) => { row[h as CrmColumn] = (cells[i] ?? "").trim(); });
    return row;
  });
}

export function readCrmFile(datasetDir: string): CrmRow[] {
  return parseCrm(fs.readFileSync(path.join(datasetDir, "crm_export.csv"), "utf8"));
}

