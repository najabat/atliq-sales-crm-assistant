// Checks that lib/text.ts does exactly what eval/lib.mjs does, on every local document.
// Skips when the dataset is not on this machine. Prints only counts.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { listDataset } from "../lib/pipeline.ts";
import { modelInput, norm } from "../lib/text.ts";

const ROOT = process.cwd();
const DATASET = path.join(ROOT, "data", "dataset");
const TESTS = path.join(ROOT, "data", "eval_extension", "hidden_instruction_emails");

test("the port strips and normalises exactly like eval/lib.mjs", { skip: !fs.existsSync(DATASET) }, async () => {
  const original = await import(path.join(ROOT, "eval", "lib.mjs").replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:"));
  const files = listDataset(DATASET).map((f) => ({ f, raw: fs.readFileSync(path.join(DATASET, f), "utf8") }));
  for (const t of fs.existsSync(TESTS) ? fs.readdirSync(TESTS) : []) files.push({ f: t, raw: fs.readFileSync(path.join(TESTS, t), "utf8") });
  let same = 0;
  for (const { f, raw } of files) {
    assert.equal(modelInput(raw, f), original.modelInput(raw, f), `modelInput differs on document ${same + 1}`);
    assert.equal(norm(raw), original.norm(raw), `norm differs on document ${same + 1}`);
    same++;
  }
  assert.ok(same >= 50);
});
