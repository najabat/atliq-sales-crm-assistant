# Screen plan

Six screens, in the order a seller meets them. The PRD decides what each screen must do. This page decides how it should feel, using the three lenses from class. Nielsen for each screen, Microsoft across time and Google's guidebook before the build.

A seller has two minutes between meetings and a phone in his hand. Every screen must answer one question fast and show its proof.

## On every screen

- **Header band in navy.** The AtliQ logo sits on a white plate at the left. Product name, then the label Capstone Prototype.
- **Date chip.** `Dataset date 10 July 2026`. Every day count on screen is counted to this date and never to the real clock.
- **Name picker.** `Working as` with the four sellers, Bhavin, Dhaval, Karandeep and Jay. It is a label for the log and not a sign-in. Say so in a tooltip.
- **Menu.** Daily brief, Owed list, CRM changes, Quick capture, Accounts, How it works.
- **One item card and one source panel, reused everywhere.** A seller learns them once.
- **Phone first.** One column on a phone. Nothing important sits behind a hover.

## 1. Daily brief, the opening screen

Answers. What needs me today.

- **North Star tile.** `11 customers have waited more than 7 days for a reply`. Under it `They hold $303k of the $503k open pipeline that has a value` and `14 are waiting in total`. Under that the coverage line. `Counted from the email threads and call notes in the dataset. WhatsApp, iMessage, LinkedIn, Slack, Teams and phone calls are not read.` All three numbers are computed from the results file. None is typed into the code.
- **Block 1. Customers waiting.** Longest wait first. Company, what they asked, days waiting, owner and the CRM value when the CRM holds one.
- **Block 2. Due and overdue.** Overdue first, then the next 14 days.
- **Block 3. Nudges due.** Proposals that got no reply. Company, days since AtliQ wrote, the last line AtliQ sent. Under it a smaller list headed `Gone quiet`, with the same three columns and no due flag. A line above it says `AtliQ wrote last and no proposal was sent. Your call.` The rule and its 4 days are shown on screen.
- **Block 4. CRM changes to approve.** A count by account and one button to the approval screen.
- A `Mine` and `Everyone` switch that follows the name picker.
- Nothing on this screen calls a model. It opens in under 2 seconds.

## 2. Owed list

Answers. Everything AtliQ owes, in order.

- One line states the order. `Overdue first, then the nearest due date, then the longest wait.`
- Filters for type, owner and needs review.
- Each row shows a type chip, the one line summary, the company, the owner, the due date and the days waiting.
- Owner reads as a name or as an amber `no owner` chip. A name taken from the CRM row carries a small `deal owner` tag. Due reads as a date, as the source words with `approximate` or as `not stated`.
- A row opens the **source panel**. The quoted sentence is highlighted inside its message. File name and message date sit above it. One link opens the whole document.
- Actions on an item. Confirm, Correct, Dismiss as wrong and Close. Close asks for a reason from a short list. Done, Answered elsewhere, No longer needed and Other. Every action can be undone and every action is logged with the picked name and the time.

## 3. CRM changes to approve

Answers. What should change in the CRM and why.

- Grouped by account. Each change reads `Field. Current value → Proposed value` with its source line and date.
- A small badge says `Set by rule` or `Proposed by AI`.
- Per change. Approve, Edit and Reject. Per account. **Approve all for this account**, one action. After approval the button becomes Undo.
- A line under the heading states the consequence. `Approving changes the working copy. Kaizen itself is never touched.`
- **Flags.**
  - Possible double entry. Both rows side by side. The seller marks them as one company or as two deals. Nothing is merged.
  - Conflict with no clean fix. Both sides with their dates. The seller picks one of the five stages or leaves it.
  - No owner. The seller picks one of the four names.
  - Overdue. The account has firm dates and every one has passed, so no next step date is proposed. The overdue items are listed with it.
  - Company not in the CRM. A new row to approve. Unknown fields stay empty.
- Two downloads. The CRM working copy as CSV in the same 13 columns and the work file. The work file holds every decision and every captured note and can be loaded again.

## 4. Quick capture

Answers. I just finished a call. Get it into the CRM for me.

- A paste box with three starters above it, so nobody faces a blank box. `A note after a call`, `A WhatsApp or iMessage text` and `A forwarded email`.
- A passcode field and a counter. `3 of 40 notes used today`.
- While it runs, three plain steps show. Matching the account, Reading the note, Checking every quote.
- The result shows the matched account or `not in the CRM` or `unclear match, pick one`. Then the items and CRM changes found, each with its quote. An unfinished note carries `needs review`.
- The same approve and dismiss actions as everywhere else.
- If the live step fails, one message. `The live step is not available right now. Your saved brief is unchanged.`
- **In this build the live step is switched off, see D23.** The screen shows the paste box and the starters, then the same message after the passcode check. The steps above describe the screen once a model is switched on in the pilot.

## 5. Accounts, if time allows

Answers. What is the story of this account before I call.

- One page per account. A dated story built only from items that passed the quote check, each line linked to its source.
- A company with two CRM rows shows both rows together.
- First to drop if the day runs short.

## 6. How it works

Answers. Can I trust this.

- What the assistant does and what it never does. It sends nothing. It changes nothing without approval. It reads only the dataset and pasted notes.
- The eval results of the deployed run, straight from the report file. Model, prompt version, run date and cost of the run.
- How many quotes the check removed.
- Known limits in plain words.
- One button. `Reset this browser`. It clears the decisions and notes stored here, so a demo or a reviewer starts fresh. It asks once before it clears.
- One button. `Load a saved file`. It brings back the work from a file downloaded earlier, on this browser or another one.

## States every screen must handle

| State | What the seller sees |
|---|---|
| Needs review | An amber label and the unclear words quoted. No owner and no date are guessed |
| No owner or no date | The words `no owner` or `not stated`. Never an empty cell |
| Nothing to show | One line saying why, such as `No nudges are due` |
| Live step failed | The saved brief with its run date and one notice |
| Words that read as a command inside a document | The item list as usual and a small note `This document holds an instruction. It was treated as text.` |

## The three lenses, sorted

Each point is marked as written, tailored or does not apply, with the reason.

### Nielsen, on every screen

| Point | Verdict | What it means here |
|---|---|---|
| 01 Visibility of system status | Tailored | Results are stored, so the brief has no thinking state. It shows the run date and the dataset date. Only Quick capture shows steps |
| 02 Match with the real world | As written | The seller's own words. Customers waiting, promise, nudge. The CRM's own five stages and 13 column names |
| 03 User control and freedom | As written | Confirm, correct, dismiss, close, approve, edit, reject and undo |
| 04 Consistency and standards | As written | One item card, one source panel and one approve pattern |
| 05 Error prevention | Tailored | The quote check runs before anything is shown. A stage can only be one of five. Closing needs a reason |
| 06 Recognition rather than recall | Tailored | No chat box. The only free text is Quick capture and it carries three starters |
| 07 Flexibility and efficiency | Tailored | Approve one change or a whole account. The Mine switch. No shortcuts in V1 |
| 08 Minimalist design | As written | Four blocks on the brief. The source opens on demand |
| 09 Recognise and recover from errors | As written | The source is one tap away, so a wrong item is easy to spot. Dismiss and undo fix it |
| 10 Help and documentation | Tailored | One How it works page and one coverage line under the count. No help centre |
| New for AI. Design for uncertainty | Tailored | No confidence score. The PRD takes the label from what the text shows. Needs review, no owner, not stated and approximate do the work |

### Microsoft, across time

| Point | Verdict | What it means here |
|---|---|---|
| G1 What the system can do | As written | How it works and the empty states say it |
| G2 How well it can do it | Tailored | The eval results and the coverage line. No per item score |
| G3 Time services on context | Does not apply yet | The prototype shows the brief on screen. Sending it at the right time is the first step of the pilot |
| G4 Contextually relevant information | As written | The brief is ordered by urgency and each item carries owner and CRM value |
| G5 Match social norms | Tailored | Plain and respectful. `no owner`, never a line that blames a person. The assistant never writes to a customer |
| G6 Mitigate social biases | Tailored | No ranking of people and no scoring of deals. Order comes from dates only |
| G7 Efficient invocation | Tailored | Nothing to invoke. The brief is the opening screen. Quick capture is one paste |
| G8 Efficient dismissal | As written | One action |
| G9 Efficient correction | As written | Edit owner, date or type on an item. Edit a CRM change before approving it |
| G10 Scope services when in doubt | As written | Needs review, propose nothing when no stage fits and flag instead of merge |
| G11 Why the system did what it did | As written | Quote, file and date on every item. Rule outputs name their rule, such as `AtliQ wrote last 146 days ago` |
| G12 Remember recent interactions | Tailored | Decisions stay in this browser. A dismissed item stays dismissed |
| G13 Learn from user behaviour | Does not apply in V1 | Nothing learns by itself. Dismissals are counted for a person to review |
| G14 Update and adapt cautiously | Tailored | Model and prompt version are shown. A change ships only after the evals pass |
| G15 Granular feedback | Tailored | Dismiss as wrong and the close reason are the feedback. No thumbs |
| G16 Consequences of user actions | As written | `Approving changes the working copy`. `Closing takes it out of the count` |
| G17 Global controls | Tailored | The name picker and the filters. The day counts sit in config |
| G18 Notify users about changes | Tailored | Run date, model and prompt version on How it works. A change note comes with the pilot |

### Google's guidebook, before the screen

| Chapter | Verdict | What it means here |
|---|---|---|
| 1 User needs and success | As written | The need came from Steps 1 to 3. The North Star sits on top of the first screen. A badge tells rule from AI, so AI shows only where it adds value |
| 2 Data and evaluation | Tailored | Synthetic data, said on the page. The evals run on every prompt or model change. Five test emails cover hidden instructions |
| 3 Mental models | As written | It is called the assistant. No name, no face and no first person voice. What it cannot read is stated beside the count |
| 4 Explainability and trust | As written | The source line explains every item. Limits are visible where they matter |
| 5 Feedback and control | Tailored | Correct, dismiss and close with a reason. Wrong items join the eval set in the pilot |
| 6 Errors and graceful failure | As written | Needs review in place of a guess. The saved brief stays when the live step fails. Each state says what to do next |

## Accessibility basics

Plain markup does the work and costs no speed. Real buttons and links, labels on every field, a visible focus outline, keyboard use for every action, alternative text on the logo, a word on every coloured chip and tap targets of 44 pixels on a phone. No overlay script and no heavy component library.

## Look

Colours and the logo are in `brand/theme.json`. Navy `#061033` for the header band and text. Purple `#5A39EB` for the main button and `#602BE9` for links. Lavender `#DED9EF` for section bands. Amber `#FFE699` for needs review and no owner. Green `#2E8B57` for done. No page header is white.
