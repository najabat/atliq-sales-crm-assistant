# A second test set, before any pilot

**Today.** There is no separate test set. The 50 documents are the development set and the test set. Tuning on them again and again can fit the prompts to these documents, even with no company name in a prompt. A perfect fixture score proves the scorer, not the product.

**Before a pilot with real users,** get approval for a second set of documents. A person writes and labels them, with new names, dates and orders. It should cover at least these cases.

- Two companies with the same name and different lead IDs. Two projects at one client.
- One customer with two threads, one answered and one not.
- A confirmed date with a time in two time zones. A call that is late or cancelled.
- A follow up date before and after today, including an overdue item.
- Hidden instructions, a false sender, private details and a note in mixed languages.
- A document with no promise. A document with several promises. A promise that replaces an earlier one.
- A right quote on the wrong CRM row. A stage read wrongly.
- Repeated items, a wrong type, a missing owner and missing run data.

**How to run it.** The labeller writes the key first and keeps it away from prompt work. Freeze the prompt. Run each model once. Report recall, precision, account matching, type, owner and date, whether CRM proposals are right, the North Star count and hidden instructions. Never change the set to save a score. Get Najabat's sign off before calling anything pilot ready.

**For the capstone.** The 50 document gate is a prototype gate on synthetic data. It is not a measure of quality on real mail.
