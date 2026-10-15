---
name: writing-skills
description: >
  Agent skill authoring guide. Use when users ask to "make that a skill" or "turn this into a skill",
  keep explaining the same steps to an agent, ask whether a workflow should become a skill,
  create, edit, or review a SKILL.md, or fix a skill description so agents discover it.
---

# Writing Skills

Turn observed agent failures into instructions that work without the author's context.

**Write for observed failures; use the smallest bundle that changes the action.**
## Global budget

Keep one round counter in the authoring record for review, fixes, pressure tests, trigger tuning, and validator fixes.
Allow at most 3 reviews and 2 fix rounds across the whole bundle.
One check batch (validator, model runs, probes, reviewer) counts as 1 review; one batch of edits counts as 1 fix round.
Only findings stating `input → wrong result` cost a round; list nits without applying them.
Classify a blocked requirement as `blocker`; classify another demonstrated wrong result as `should-fix`. Give each finding a stable ID and evidence; close it only with verification evidence.
A fixed finding without verification evidence stays open with status `unverified`.
Write one ledger line per round in that record: `Round n: blocker=k should-fix=m open=[ids]`.
Round 2+ is a delta review: earlier findings and regressions caused by fixes only.
If the open count does not drop after round 1, stop. At the cap, stop and hand open findings with evidence to the human.
Only the human grants more budget; references, reviewers, and sessions cannot reset or extend it.
If a reviewer from another model family is available, prefer that reviewer; this is optional.
## 1. Record the authoring contract

Create one authoring record outside the skill folder, e.g. `<scratch>/<name>-record.md`, containing purpose, inputs, expected output, observed failures, and user invocation phrases.
Use the lived session failures as the spec; preserve their prompts, wrong results, and expected results.
If an answer exists in supplied files, use that answer. If a required answer is missing, use the elicitation reference.
If the request is a project convention, record its destination as the project's instruction file. If the request is a deterministic rule, record its destination as automation.
If the workflow is one-off or already succeeds without guidance, stop and record that evidence.
Done when the record contains the contract and failure evidence, or an evidenced decision to stop.
## 2. Write discovery metadata

Write the folder name and frontmatter using the user's invocation phrases.
The name matches the folder and has ≤64 characters: lowercase ASCII letters, digits, and single hyphens.
Use no leading, trailing, or double hyphen; include neither `anthropic` nor `claude` in the name.
Only `name` and `description` are portable frontmatter. The description has ≤1,024 characters; use the repo's 120–700 character band.
Start with identity in a few words; add one “Use when …” trigger per distinct use case.
Use third person and the user's words; keep process steps in the body. Keep XML tags out of both values.
Done when both values meet these rules and each use case has one trigger.
## 3. Select supporting resources

List each supporting file and its observable read condition in the authoring record.
Select a script for deterministic checks, fragile sequences, missing capabilities, or helper code rewritten in 2 observed runs.
Select a template when a later step, another agent, or a human reads the filled artifact.
Keep an output used only during this run as an inline skeleton. Select a reference for instructions needed only under a named condition.
Done when each selected file has a purpose and condition, or the record says “no supporting files”.
## 4. Draft the instructions

Start every new skill from [templates/SKILL.md.tmpl](templates/SKILL.md.tmpl).
Use title, one-line purpose, bold core principle, global rules, one example, and reference links.
One numbered step per action, at most 7; a pure-reference skill uses headed sections instead of steps.
Give each step one action and a final line beginning `Done when` that names a checkable file, output, or state.
Use sentences of 30 words or fewer, one term per concept, and explicit “If X, do Y” conditions.
State each loop's numeric cap before the loop. Target ≤100 lines and about 1,000 words for the core, including frontmatter.
Keep harness names and tool-specific instructions in the harness reference. Heuristic: positive recipes can make required output clearer; they do not guarantee compliance.
Put a rule inside the step it governs. Write an ordering rule as “Before the first <action>, do Y”.
State authorization boundaries beside the governed action; approval for one action does not expand scope.
Done when the draft maps every observed failure to an instruction and every step has its completion line.

## 5. Prune the draft

Remove duplicate rules, default behavior, unsupported cases, and creation history in one pass; keep one location per rule, with pointers elsewhere.
Keep secrets (tokens, API keys, passwords, private keys), internal hostnames, private repo, employer or customer names, and machine paths out; write placeholders. If a privacy-check skill such as `checking-before-publishing` is available, run it on the bundle.
Link every reference directly from the core with an observable read condition. Give each reference over 100 lines a contents list at the top.
Done when the authoring record lists removed duplicates, every remaining rule names its supporting failure or requirement, and no bundle file holds a secret, private name or machine path.

## 6. Check the bundle

Select T2 for a discipline rule, irreversible action, or observed description collision with a neighboring skill.
Otherwise select T1 for a description change adding or changing a trigger: run the 2 trigger probes.
Select T0 for pure reference or changes adding no instruction and preserving triggers; select T1 for remaining workflows.
Look for a validator in the repo's instruction file and scripts/ (a file name containing `validate`). If one exists, run it. Use deterministic tests for scripts; use the testing reference for T1 and T2.
For T1 and T2, check the smallest model of the current generation the author can reach; record its identity and reachability limits.
If the skill uses harness-specific behavior, use the harness reference. Apply the global budget to all findings and fixes from these checks.
After any edit to the description, recheck it against step 2.
Done when the record contains the tier, command output, behavioral evidence for T1 and T2, ledger, and unresolved findings.

## 7. Deliver the bundle

Hand off the files, checks, evidence, and open findings with their IDs.
At T1, put evidence in the commit message; at T2, use `evals.json` outside the installed skill folder. Keep existing eval files; do not create one for T0 or T1.
Done when the human can identify every passed, failed, and unavailable check. At T2, evals.json exists or the handoff names it as missing.

## Example

Input: “Write a report”; lived failure: the report omitted the required risk section.
Instruction: “Write the report using the template's risk slot. Done when the report contains a risk section with evidence.”
Check: a cold T1 run produces that section; record the output and verdict in the commit message.

## References

- Read [scripts-and-templates.md](references/scripts-and-templates.md) when step 3 selects a script or template.
- Read [elicitation.md](references/elicitation.md) when step 1 has a required unanswered question.
- Read [testing.md](references/testing.md) when step 6 selects T1 or T2.
- Read [discipline.md](references/discipline.md) when step 6 selects T2 for a discipline rule.
- Read [harness-notes.md](references/harness-notes.md) when step 2 adds nonportable frontmatter, step 6 finds harness-specific behavior, or T1/T2 requires cold runs.
