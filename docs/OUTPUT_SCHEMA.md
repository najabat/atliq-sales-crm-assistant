# Output schema

One run of the assistant writes one JSON file. The screens read it and the scorer in `eval/score.mjs` reads it. Keep the field names exactly as written here. A working example is `eval/fixtures/perfect_results.json`. It carries `owner_from` on every item and the two `overdue` flags.

Where the files go.

- `data/results/<model>/results.json`. The full run on the 50 documents.
- `data/results/<model>/results_run2.json`. A second run on the same input, for consistency.
- `data/results/<model>/results_tests.json`. The run on the five hidden instruction test emails.
- `data/results/<model>/run_log.jsonl`. One line per model call. See the last section.
- `data/results/current.json`. A copy of the winning model's `results.json`. The deployed app reads only this file.

## results.json

```json
{
  "run": {
    "run_id": "2026-10-11T10-30-00Z_claude-haiku-5-5",
    "prompt_version": "v1",
    "model": "claude-haiku-5-5",
    "reference_date": "2026-07-10",
    "documents": 50,
    "input_tokens": 0,
    "output_tokens": 0,
    "cost_usd": 0,
    "duration_seconds": 0
  },
  "documents": [],
  "items": [],
  "waiting_customers": [],
  "gone_quiet": [],
  "crm_changes": [],
  "crm_flags": [],
  "dropped": []
}
```

### documents

One entry per file, 50 in a full run.

| Field | Type | Meaning |
|---|---|---|
| file | string | Path inside `data/dataset`, such as `emails/2026-01-15_example_enquiry.md`. For a test email, the file name alone |
| accounts | list of strings | CRM rows this document belongs to, such as `["L-9001"]`. A company with no CRM row is written `NEW:Example Tiles Ltd` |
| internal | true or false | True when no customer is on the document |
| last_external_message_from | `customer`, `atliq` or null | Who wrote last, leaving out automatic replies and internal emails. Set by code. Null for notes |
| last_external_message_date | date or null | Date of that message |
| customer_last_message_asks | true, false or null | Set by the model. True when the customer's last message asks AtliQ for something. False for a plain confirmation or a sign-off |
| atliq_last_message_expects_answer | true, false or null | Set by the model. True when AtliQ's last message expects an answer. False when it holds AtliQ's own promise or only confirms |
| atliq_last_message_carries_proposal | true, false or null | Set by the model. True when AtliQ's last message sends or follows up a proposal, quote, estimate or approach note. False for cold outreach or anything else. Null when AtliQ did not write last |
| needs_review | true or false | The source is unclear, in conflict or unfinished |
| instruction_flagged | true or false | The text holds words that read as a command to the assistant |
| status | `ok`, `needs review` or `failed` | `needs review` when a call still failed its quote check after its one retry. `failed` when the output did not parse after its retry. Both are logged |

### items

One entry per owed item that passed the quote check.

| Field | Type | Meaning |
|---|---|---|
| id | string | Stable. Built from the file, the type and the quote, so the same item gets the same id on every run |
| file | string | The source file |
| type | string | `reply_owed`, `promise`, `deadline`, `come_back`, `new_need` or `nudge_due` |
| account | string | Company name as the CRM writes it or the name found in the document |
| lead_id | string or null | The CRM row. Null when the company is not in the CRM |
| summary | string | One plain line. What AtliQ owes and to whom |
| quote | string | Copied word for word from the file. No quote, no item |
| message_date | date | Date of the message or note the quote sits in |
| owner | string | A first name or the words `no owner` |
| owner_from | `source`, `crm` or null | Where the owner came from. `crm` means the deal owner on the CRM row. Null with `no owner` |
| due_date | date or null | Only when the source gives a calendar date or a weekday that can be worked out |
| due_text | string or null | The words of the source, such as `mid-July` |
| due_approx | true or false | True when the date is loose |
| days_waiting | number or null | For `reply_owed`, days since the customer's last message. For `nudge_due`, days since AtliQ's last message. Counted to the reference date |
| needs_review | true or false | Unclear source. The unclear words are in the quote |
| status | string | `new` or `needs review` when a run writes it. A seller's decisions live in the browser and never in this file |
| candidate_lead_ids | list of strings, optional | Set only when two or more CRM rows fit and no single row can be chosen. Then `lead_id` is null and `status` is `needs review`. Owner and dates come only from the source, never from either row. A reply owed shows `no owner` |

### waiting_customers

The North Star list. Built by code from `documents` and the model's two flags. One entry per customer, however many threads wait.

| Field | Type | Meaning |
|---|---|---|
| account | string | Company |
| lead_id | string or null | CRM row |
| file | string | The thread that waits. If two wait, the one with the customer's latest message |
| last_customer_message_date | date | |
| days_waiting | number | To the reference date |
| candidate_lead_ids | list of strings, optional | Set only when two or more CRM rows fit and no single row can be chosen. Then `lead_id` is null. The customer counts once |

### gone_quiet

Threads where AtliQ wrote last, the message expects an answer, no proposal was sent and 4 days or more have passed. Built by code. They carry no due flag and are not owed items. The brief lists them under the nudges for the seller to judge. Won and Lost deals are left out.

| Field | Type | Meaning |
|---|---|---|
| account | string | Company |
| lead_id | string or null | CRM row |
| file | string | The thread |
| last_atliq_message_date | date | |
| days_since | number | To the reference date |
| quote | string | AtliQ's last line, word for word |
| candidate_lead_ids | list of strings, optional | Set only when two or more CRM rows fit and no single row can be chosen. Then `lead_id` is null |

### crm_changes

One entry per proposed change to one field. Nothing here is saved until a seller approves it. For `notes`, a quote that is found proves the line has a source. It does not prove the line is right. The seller checks the full proposed line against the source before he approves.

| Field | Type | Meaning |
|---|---|---|
| id | string | Stable |
| lead_id | string or null | Null for a new row |
| company | string | |
| field | string | One of the 13 CRM columns or `new_row` |
| current | string or null | The value in the export |
| proposed | string or object | The new value. For `new_row`, an object with only `company`, `contact_name`, `contact_email` and `source`, each null when the source does not state it. Value, stage, owner and every other column stay empty |
| quote | string or null | Word for word. Required when `set_by` is `model` |
| file | string or null | Where the quote or the date comes from |
| set_by | `rule` or `model` | Code sets `last_contact_date` and `next_followup_date`. The model proposes `status`, `notes`, `est_value_usd`, `service_interest`, `owner` and `new_row` |
| status | string | `proposed` when a run writes it |
| candidate_lead_ids | list of strings, optional | Set only when two or more CRM rows fit and no single row can be chosen. The change is proposed for each of the rows and the approval card labels it `two CRM rows, possible double entry`. Used today for `last_contact_date` |

### crm_flags

| Field | Type | Meaning |
|---|---|---|
| kind | string | `double_entry`, `no_owner`, `conflict`, `missing_company` or `overdue`. `overdue` marks an account that has at least one firm date and all of them have passed, so its next step date stays empty. An account with no firm date gets no flag |
| lead_ids | list | The rows concerned. Empty for a missing company |
| company | string or null | |
| file | string or null | |
| quote | string or null | Word for word when a file is given |
| note | string | One plain line for the screen. For a conflict, both sides with their dates |

### dropped

Everything the quote check removed. `{ "file": "...", "kind": "item" or "crm_change", "quote": "...", "reason": "quote_not_found" }`. It is never shown as an item. It is counted on the trust page.

## run_log.jsonl

One line per model call. `{ "time", "run_id", "prompt_version", "model", "call": 1 or 2, "file" or "lead_id", "input_tokens", "output_tokens", "cost_usd", "retried", "quote_check": { "kept", "dropped" }, "raw_output" }`.

No API key and no passcode is ever written to a log.

## What a seller decides

Decisions are not part of a run. They live in the browser and in the exports.

`{ "target": item id or change id, "action": "confirm" | "correct" | "dismiss" | "close" | "approve" | "edit" | "reject" | "undo", "by": "Jay", "at": time, "reason": text or null, "old_value", "new_value" }`
