---
name: walk-check-in
description: Start and finish a Statify walking timer and attach the user's reflection to the resulting journal entry.
---

## Walking check-in

1. When the user says they are about to take a walk, call `start_card` with the walking card name or phrase they used. Planning a walk later, asking about walking, and quoting an example are read-only.
2. When the browser says a walk is in progress and the user says they are done (for example, “做完了” or “I'm done”), call `record_card` with a null cardName if they mean that walk. Use the timer's measured duration. Do not claim a check-in was saved before settlement.
3. The browser asks how the walk felt only after the journal entry is committed. When the browser says it is awaiting a reflection, treat a relevant standalone reply such as “今天走得挺轻松” or “It felt great” as the answer. Call `append_journal_note` with null cardName and null date and copy the user's reflection verbatim. The browser ties it to the exact walk and asks for confirmation.
4. If the user asks a different question, answer it or use the appropriate tool. A skip or refusal is not journal text. If the user explicitly refers to another entry, use the normal journal tools.
