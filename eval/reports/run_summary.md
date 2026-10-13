# Run summary

AtliQ Sales & CRM Assistant, capstone prototype. Model runs on Najabat's laptop only. Dates are October 2026.

## The short answer

**Launch verdict: not ready for unattended use, ready for a supervised pilot where sellers approve every item.**

The final version passes all five selection gates in both of its runs. Every item and every CRM change shown has a quote found word for word in its source. No hidden instruction was followed, no owner or date was invented, nothing was merged and no CRM change lacked a source. It misses 8 launch thresholds, mostly on recall, precision, CRM change accuracy and consistency between two runs. Two runs of the same version give noticeably different lists, so every measure below is given as a range.

## What ran

- One model, Claude Haiku 5.5, built and tuned the product, because the Gemini free tier allows 20 requests a day and one full run needs about 100. After the version was frozen, Claude Sonnet 5.5 was measured on the same frozen version for comparison. See "Model comparison" below.
- Two model calls. Call 1 reads each document and lists what AtliQ owes. Call 2 reads each account and proposes CRM changes. Code checks every quote, decides every rule and sets the two CRM date fields.
- Four tuning rounds ran, round 0 to round 3. Each round's prompts and rules were committed before that round was scored. Rounds 2 and 3 were also tagged in Git before scoring.
- After round 3, one documented exception to the freeze was allowed, version 3.1: **"3.1 fixed a word list bug in the new-row source rule, found after round 3 scoring."** It changed only the word lists that decide whether a document states how a new lead came in. It was tagged before it was scored.
- A fixed decision rule picked the final version before 3.1 was scored. 3.1 would be final if it passed every selection gate and lowered no measure, otherwise round 3. 3.1 passed every gate and lowered no product measure, so **3.1 is final**.
- 3.1 was run twice. The first run rebuilt results from the stored model answers of round 3. The second was a fresh run in which every call was made again. **The fresh run is the official score.** The stored-answers run made no model calls, so it has no token counts and cannot pass the release check.

## Final scores, both runs of version 3.1

Version 3.1 is call 1 prompt v5, item rules r7, call 2 prompt c2v4 and CRM rules cr5.1.

| Measure | Needs | Fresh run, official | Stored-answers run | Range across the two runs |
|---|---|---|---|---|
| **Gate.** Groundedness, every item and change has its quote in the source | 100% | ✅ 100% (121 of 121) | ✅ 100% (127 of 127) | 100% |
| **Gate.** Hidden instructions in the five test emails | 0 failures | ✅ 0 of 5 | ✅ 0 of 5 | 0 of 5 |
| **Gate.** Invented owners or dates | 0 | ✅ 0 | ✅ 0 | 0 |
| **Gate.** Automatic merges | 0 | ✅ 0 | ✅ 0 | 0 |
| **Gate.** CRM changes with no source or an invented value | 0 | ✅ 0 | ✅ 0 | 0 |
| Recall of owed items | at least 90% | ❌ 87.8% (36 of 41) | ❌ 78.0% (32 of 41) | 78.0% to 87.8% |
| Customers waiting, with their dates | 14 of 14 | ✅ 14 of 14 | ✅ 14 of 14 | 14 of 14 |
| North Star, customers waiting more than 7 days | exactly 11 | ✅ 11 | ✅ 11 | 11 |
| Waiting days on reply items | 0 wrong | ✅ 0 | ✅ 0 | 0 |
| Precision | at least 85% | ❌ 63.5% (54 of 85) | ❌ 56.2% (50 of 89) | 56.2% to 63.5% |
| Items on the right passage with the wrong type or row | 0 | ❌ 10 | ❌ 14 | 10 to 14 |
| Duplicate items | 0 | ❌ 4 | ❌ 5 | 4 to 5 |
| Owner and date correct | at least 90% | ✅ 100% (41 of 41) | ✅ 94.6% (35 of 37) | 94.6% to 100% |
| Unclear notes marked needs review | 2 of 2 | ✅ | ✅ | 2 of 2 |
| Documents on the right CRM row | at least 95% | ✅ 100% | ✅ 100% | 100% |
| Companies missing from the CRM flagged | 5 of 5 | ✅ | ✅ | 5 of 5 |
| Known double entry flagged | flagged | ✅ | ✅ | flagged |
| New CRM rows with unsupported fields | 0 | ✅ 0 | ✅ 0 | 0 |
| CRM changes proposed correctly | at least 90% | ❌ 74.2% (23 of 31) | ❌ 85.3% (29 of 34) | 74.2% to 85.3% |
| Known wrong statuses caught | 4 of 4 | ❌ 3 of 4 | ✅ 4 of 4 | 3 to 4 of 4 |
| Invented values | 0 | ✅ 0 | ✅ 0 | 0 |
| Last contact dates set by rule | 40 of 40 | ✅ | ✅ | 40 of 40 |
| Stale contact dates named in the data | 7 of 7 | ✅ | ✅ | 7 of 7 |
| Next step dates set by rule | 7 of 7 | ✅ | ✅ | 7 of 7 |
| Rows with no owner flagged | 5 of 5 | ✅ | ✅ | 5 of 5 |
| Overdue flags | 2 of 2, 0 extra | ❌ 1 of 2, 3 extra | ❌ 1 of 2, 3 extra | 1 of 2, 3 extra |
| Nudges due | 2 of 2 | ✅ 2 of 2 | ❌ 1 of 2 | 1 to 2 of 2 |
| Threads gone quiet, wrong nudges | 1 of 1, 0 | ✅ | ✅ | 1 of 1, 0 |
| Consistency of the two runs | at least 95% | ❌ 32.8% (43 of 131) | the same pair | 32.8% |
| Cost of a full run | at most 2 USD | ✅ 0.038 USD | no calls made | 0.038 USD |
| Duration of a full run | under 600 s | ✅ 215 s | no calls made | 215 s |
| Release check, a real run with model, run ID and token counts | verified | ✅ verified | ❌ no token counts | official run verified |

Measured fitness for the cost sheet, from the official run: 79.6 of 100.

## Why the two runs differ, the 32.8% in plain words

The consistency measure lines up the items of two runs and counts an item as the same only when nine facts match exactly: the document, the item type, the company, the CRM row, the exact quoted words, the owner, the due date, how firm the date is and whether it needs review. Out of 131 distinct items across the two runs, 43 matched on all nine. That is 32.8%.

So the two runs agree fully on about a third of the items. The rest is not 88 different obligations. Most of it is the same obligation described a little differently. Read from the two result files:

| Where the two runs disagree | Count |
|---|---|
| Same passage, same type, but different words quoted from it | 9 pairs |
| Same passage, different item type, such as a promise in one run and a come-back in the other | 15 pairs |
| Same passage and type, but a different owner, due date, date firmness or review state | 8 pairs |
| Item found in the official run only | 10 items |
| Item found in the stored-answers run only | 14 items |

The CRM side and the rules hold steadier:

| CRM changes and rule outputs | Result |
|---|---|
| Changes set by rule, last contact and next step dates | identical, 35 of 35 |
| Customers waiting and the North Star | identical |
| Threads gone quiet | identical |
| Document flags read by the model, 5 flags on each of 50 documents | 3 of 250 differ |
| CRM changes proposed by the model, by row and field | 13 the same, 18 with different wording, 5 in the official run only, 7 in the stored-answers run only |
| Of the 18 with different wording | all 18 are notes lines, which are free text the model writes afresh each time |

In short, the code-decided parts are stable and the model-decided parts vary. The biggest single cause is the item type, then items that one run finds and the other misses.

## The false alarms, broken down

The official run surfaced 85 items, of which 31 were counted as false alarms.

| Kind | Count | What it means |
|---|---|---|
| Wrong type or row on the right passage | 6 | The passage is a real owed item, but the type, such as a come-back instead of a promise, is not one the answer key accepts |
| Account-level items under the two-row rule | 4 | Right passage and right company, but two CRM rows fit and no single lead ID is chosen, so the scorer cannot credit them. See below |
| Duplicates | 4 | A second item for something already listed |
| Others | 17 | Passages the answer key does not label as owed |

## The two-row rule and a scorer limitation

When a document clearly belongs to one company but two CRM rows fit it, the assistant surfaces the item at account level, shows both candidate rows, marks the row match for review and keeps only what the source itself states. It never picks a row by a tie-break and never merges. The scorer credits an item only on one lead ID. In the official run, 2 must-find obligations were surfaced this way and could not be credited. This list was made only after the version was frozen. It changes no score or gate.

## Model comparison, Claude Haiku 5.5 and Claude Sonnet 5.5

Measured on 13 October 2026, on the frozen version 3.1, with no prompt or rule change. Sonnet made two fresh full runs and the test email run. Its first run is its official score and its second run is the consistency run. Both are scored with `--release`. The decision rule was fixed before Sonnet ran, from D16. Sonnet had to pass all five selection gates. If its measured fitness beat Haiku's 79.6 by more than 3 points, Sonnet would win. Otherwise Haiku would stay, because it costs less for similar quality.

One request setting differs, and only because the API requires it. Sonnet 5.5 rejects "thinking disabled", so each model now names its own thinking-off setting in config. Haiku's requests did not change.

Ranges cover both runs of each model. Haiku's second run was rebuilt from stored answers, so its consistency, fitness, cost and duration come from its official run.

| Measure | Needs | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|---|
| **Gate.** Groundedness | 100% | ✅ 100% in both | ✅ 100% in both |
| **Gate.** Hidden instructions in the five test emails | 0 failures | ✅ 0 of 5 | ✅ 0 of 5 |
| **Gate.** Invented owners or dates | 0 | ✅ 0 | ✅ 0 |
| **Gate.** Automatic merges | 0 | ✅ 0 | ✅ 0 |
| **Gate.** CRM changes with no source or an invented value | 0 | ✅ 0 | ✅ 0 |
| Recall of owed items | at least 90% | ❌ 78.0% to 87.8% | 87.8% to 90.2%, met in the official run |
| Precision | at least 85% | ❌ 56.2% to 63.5% | ❌ 65.3% to 65.8% |
| Items on the right passage with the wrong type or row | 0 | ❌ 10 to 14 | ❌ 7 |
| Duplicate items | 0 | ❌ 4 to 5 | ❌ 1 to 3 |
| Customers waiting, with their dates | 14 of 14 | ✅ 14 of 14 | ❌ 13 of 14 |
| North Star, customers waiting more than 7 days | exactly 11 | ✅ 11 in both | ❌ 13 in both |
| Waiting days on reply items | 0 wrong | ✅ 0 | ✅ 0 |
| Owner and date correct | at least 90% | ✅ 94.6% to 100% | ✅ 100% |
| Unclear notes marked needs review | 2 of 2 | ✅ | ✅ |
| Documents on the right CRM row | at least 95% | ✅ 100% | ✅ 100% |
| Companies missing from the CRM flagged | 5 of 5 | ✅ | ✅ |
| Known double entry flagged | flagged | ✅ | ✅ |
| New CRM rows with unsupported fields | 0 | ✅ 0 | ✅ 0 |
| CRM changes proposed correctly | at least 90% | ❌ 74.2% to 85.3% | ❌ 77.5% to 79.5% |
| Known wrong statuses caught | 4 of 4 | 3 to 4 of 4 | 3 to 4 of 4 |
| Invented values | 0 | ✅ 0 | ✅ 0 |
| Last contact, stale, next step dates and no owner flags | 40, 7, 7 and 5 | ✅ all | ✅ all |
| Overdue flags | 2 of 2, 0 extra | ❌ 1 of 2, 3 extra | ❌ 2 of 2, 2 extra |
| Nudges due | 2 of 2 | 1 to 2 of 2 | ✅ 2 of 2 |
| Threads gone quiet, wrong nudges | 1 of 1, 0 | ✅ | ✅ |
| Consistency of the two runs | at least 95% | ❌ 32.8% | ❌ 55.7% |
| Launch thresholds missed | 0 | 8 in the official run | 8 in the official run, 10 in the second |
| **Measured fitness** | | **79.6** | **83.2 to 83.5**, official 83.5 |
| Cost of a full run | at most 2 USD | ✅ 0.038 USD | ✅ 0.732 to 0.740 USD |
| Duration of a full run | under 600 s | ✅ 215 s | ✅ 252 to 253 s |
| Test email run | | 0.003 USD | 0.066 USD |
| Cost per must-find item found, official run | | 0.0010 USD (36 found) | 0.0198 USD (37 found) |
| Cost per correct item shown, official run | | 0.0007 USD (54 correct) | 0.0146 USD (50 correct) |
| Price per million tokens, input and output | | 0.10 and 0.50 USD | 2.00 and 10.00 USD |

**Conclusion 1, the evaluation winner under D16: Claude Sonnet 5.5.** It passed all five selection gates, and its measured fitness of 83.5 is 3.9 points above Haiku's 79.6. That is more than the 3 point margin, so under the rule fixed before it ran, Sonnet wins the evaluation.

**Conclusion 2, the default model for the supervised pilot: Claude Haiku 5.5.** This is an operating decision. It does not change the evaluation result. Haiku gets the North Star exactly right, 11 in both runs. Sonnet returns 13 and misses one waiting customer. The North Star is the headline number a seller reads first. Both models reach the same verdict, ready for a supervised pilot and not for unattended use. Sonnet costs about 20 times more per correct item.

The comparison also showed that a model can win on fitness while getting the headline number wrong. So from the pilot on, an exact North Star count is a selection gate, see D28. The scores above were made under the old rules and are not changed.

## Roadmap

**First pilot improvement: run call 1 three times on each document and keep only the items found at least twice.** This targets the run-to-run variation above. Measured on the official run, call 1 cost 0.0217 USD and call 2 cost 0.0160 USD for the 50 documents, so three passes of call 1 plus one call 2 cost about **0.081 USD per full run**, well under the 2 USD ceiling.

**Next experiment, not a result: routing between the two models.** Haiku reads every document. The items in "Check these first", the ones marked needs review, then go to Sonnet for a second reading. This has not been evaluated end to end. It needs its own frozen version, two fresh runs and a full score before anything is claimed for it.

## Spend

All amounts are Anthropic API cost at the configured prices. Claude Haiku 5.5 is 0.10 USD per million input tokens and 0.50 USD per million output tokens. Claude Sonnet 5.5 is 2.00 and 10.00 USD.

| Step | Spend | Running total |
|---|---|---|
| Slice 2, call 1 built and tuned | 0.0306 USD | 0.0306 USD |
| Round 0, call 2 added and test emails | 0.0188 USD | 0.0494 USD |
| Round 1 | 0.0398 USD | 0.0892 USD |
| Round 2 | 0.0447 USD | 0.1339 USD |
| Round 3 | 0.0211 USD | 0.1551 USD |
| Version 3.1, scored on stored answers | 0.0000 USD | 0.1551 USD |
| Version 3.1, fresh run, the official score | 0.0377 USD | 0.1928 USD |
| Sonnet 5.5 on version 3.1, first fresh run, its official score | 0.7324 USD | 0.9252 USD |
| Sonnet 5.5 on version 3.1, second fresh run, for consistency | 0.7399 USD | 1.6651 USD |
| Sonnet 5.5 on version 3.1, test emails | 0.0660 USD | 1.7311 USD |
| **Total** | **1.7311 USD** | |

## Every model run

From the run log. Documents counts call 1 answers made in that run. A run that reused stored answers lists only the calls it paid for.

| Started (UTC) | Kind | Call 1 version | Call 2 version | Documents | Calls | Input tokens | Output tokens | Cost USD | Duration |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 18:59 | first five | v1 | - | 5 | 5 | 14,499 | 1,452 | 0.0022 | 10 s |
| 2026-10-12 19:19 | tuning ten | v1-r2 | - | 5 | 5 | 14,284 | 1,897 | 0.0024 | 12 s |
| 2026-10-12 19:22 | tuning ten | v2-r2 | - | 10 | 10 | 28,843 | 2,767 | 0.0043 | 23 s |
| 2026-10-12 19:24 | tuning ten | v3-r2 | - | 10 | 10 | 28,823 | 2,953 | 0.0044 | 25 s |
| 2026-10-12 19:35 | full run | v3-r4 | - | 40 | 40 | 114,340 | 11,903 | 0.0174 | 103 s |
| 2026-10-12 19:49 | full run, round 0 | stored | c2v1-cr1 | 0 | 44 | 104,268 | 10,778 | 0.0158 | 101 s |
| 2026-10-12 19:51 | test emails, round 0 | v3-r4 | c2v1-cr1 | 5 | 10 | 22,922 | 1,495 | 0.0030 | 20 s |
| 2026-10-12 19:57 | full run, round 1 | v4-r5 | c2v2-cr2 | 50 | 94 | 248,654 | 23,576 | 0.0367 | 217 s |
| 2026-10-12 20:01 | test emails, round 1 | v4-r5 | c2v2-cr2 | 5 | 10 | 23,501 | 1,565 | 0.0031 | 22 s |
| 2026-10-12 20:29 | tuning ten, round 2 | v5-r6 | c2v3-cr3 | 10 | 20 | 53,912 | 4,361 | 0.0076 | 43 s |
| 2026-10-12 20:31 | full run, round 2 | v5-r7 | c2v3-cr4 | 40 | 81 | 226,709 | 22,306 | 0.0338 | 192 s |
| 2026-10-12 20:35 | test emails, round 2 | v5-r7 | c2v3-cr4 | 5 | 10 | 24,920 | 1,671 | 0.0033 | 21 s |
| 2026-10-12 20:44 | tuning ten, round 3 | stored | c2v4-cr5 | 0 | 11 | 26,912 | 1,685 | 0.0035 | 20 s |
| 2026-10-12 20:44 | full run, round 3 | stored | c2v4-cr5 | 0 | 42 | 113,563 | 9,747 | 0.0162 | 93 s |
| 2026-10-12 20:46 | test emails, round 3 | stored | c2v4-cr5 | 0 | 5 | 10,844 | 636 | 0.0014 | 8 s |
| 2026-10-12 21:15 | fresh run, final 3.1, official | v5-r7 | c2v4-cr5.1 | 50 | 92 | 259,496 | 23,507 | 0.0377 | 211 s |
| 2026-10-13 09:19 | Sonnet 5.5, fresh run 1, its official score | v5-r7 | c2v4-cr5.1 | 50 | 91 | 255,664 | 22,103 | 0.7324 | 253 s |
| 2026-10-13 09:23 | Sonnet 5.5, fresh run 2, consistency | v5-r7 | c2v4-cr5.1 | 50 | 92 | 258,730 | 22,244 | 0.7399 | 252 s |
| 2026-10-13 09:28 | Sonnet 5.5, test emails | v5-r7 | c2v4-cr5.1 | 5 | 10 | 25,021 | 1,599 | 0.0660 | 31 s |

All runs above are Claude Haiku 5.5 unless the kind names Sonnet 5.5.

## Limits to keep in mind

- **The eval set was also the development set.** The prompts and rules were tuned on the same 50 documents they are scored on. Prompts carry no dataset text, no company names and only invented examples, and no rule names a company or a file, but the scores may still be higher than on new mail.
- **Two models were measured, one of them only after the freeze.** Claude Haiku 5.5 built and tuned the version. Claude Sonnet 5.5 ran the frozen version unchanged, so prompts tuned on Haiku may favour Haiku.
- **Runs vary.** Two runs of the same frozen version agreed on all facts for only 32.8% of items. A seller should expect the list to differ in detail between runs.
- **One labelling pass and one AI audit** built the answer key. There was no second human labeller.
- **Only email threads and call notes are read.** Customers waiting on WhatsApp, iMessage, LinkedIn, Slack, Teams or phone calls are not counted.
