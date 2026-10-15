# Elicitation

Ask for facts only the human holds; record answers in the authoring record.
The core's global budget still governs review and fixes.

1. List the missing answers.

   Read supplied files before asking about layout, helpers, conventions, or test commands.
   List missing failure evidence, invocation phrases, preferences, and authorization boundaries.
   Assign each missing answer a named slot in the authoring record.
   Done when every required unknown has a slot and no slot asks for an answer already present in supplied files.

2. Ask one primary question per message.

   Heuristic: one primary question makes it easier to use the answer in the next question.
   Ask openly for observed failures and invocation phrases; a menu can replace the user's evidence with a guess.
   For a decision with known choices, offer 3 concrete options when 3 choices exist.
   Mark one recommendation and allow the human's own words.
   If the answer is vague, ask for the input, wrong result, and expected result.
   Use at most 3 question messages in this authoring run.
   If required slots remain unanswered after message 3, hand them to the human and stop dependent work.
   Done when required slots have concrete answers, or the unanswered slots are handed off.

3. Record each answer as it arrives.

   Preserve observed symptoms and invocation phrases verbatim.
   If the human reports a failure that a synthetic run cannot reproduce, retain it in the spec.
   If work resumes, ask only about unanswered slots within the remaining question count.
   Do not infer approval from silence or elapsed time.
   Done when the record contains each answer, its source, and the number of question messages used.
