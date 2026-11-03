# Evidence, levels and verdict

Read this when step 4 writes a finding.

## Contents
- Levels
- Proof rules
- Refutation pass
- Written rules
- Acceptance criteria
- Legacy
- Verdict
- Pressure excuses

## Levels

| Level | Blocks | When |
|---|---|---|
| needs fix (high) | yes | Data, security or the main flow breaks in normal use; the branch's CI or the repo's own check is red; a written security rule is broken |
| should fix (medium) | yes | Documented behaviour breaks in a realistic but less common case, or a written rule breaks |
| can fix (low) | no | Real but small impact, or the only basis is a pattern in similar code |
| no evidence | no | Not in the report. Count it as discarded |

Decision rule: a result that contradicts an acceptance criterion or the stated behaviour on ordinary input is needs fix (`firstN(items, 2)` returns three items). Documented behaviour broken only on a realistic but less common input, or a written rule broken, is should fix (`firstN` fails only when `n` exceeds the array length).
An effect that needs a contrived input is can fix at most.

## Proof rules

A proof is a command or test that fails on the reviewed code. For a missing feature it is a search that finds no caller, route or path.

- Deterministic: no network, no clock dependence, no model.
- It calls the real code. It does not mock the defect away and does not edit the code under test.
- Blocking levels need a control: a neighbouring path that works, shown in the same proof line.
- Keep proof scripts untracked or outside the repo. Delete them after the review.
- If a candidate has no proof under these rules, drop it and count it. Do not weaken the rule to keep it.
- A fix for a blocking finding ships the test that failed on the old code.

## Refutation pass

For each blocking candidate, try once to disprove it: a guard elsewhere, a trigger that cannot happen, code older than the branch, behaviour the intent asks for.
If one holds, drop the candidate and count it. At most one pass per candidate.

## Written rules

Sources: instruction files, contributing guides, docs, architecture notes, lint, formatter and validator configs, the PR template.

- A violation is a finding only with both quotes: the rule (file:line) and the violating line.
- A rule too vague to apply is not a finding.
- Two rules that conflict go under Not checked, with both locations.
- Scope: new and changed lines and files. Older violations are legacy.
- The change itself counts too: check commit messages, branch name and PR title against rules that name them.
- Level: should fix. Needs fix when the repo's own check fails or the rule is about security.
- Structure and layering rules: see lens-architecture.md.

## Acceptance criteria

Prove each criterion in this order and label it:

- `[OK]`: a test or script, with the command and result.
- `[OK-IMAGE]`: start the app locally, drive it, save a screenshot. A scripted assertion (text, status, output) decides pass or fail. The image shows the reader what was seen. For UI changes save base and head.
- `[CODE-ONLY]`: static analysis, only when the app cannot run here. Give the reason. Reading code proves a missing path, never a correct behaviour.
- `[MISSING]`: not met. It is also a finding.
- `[NOT-CHECKABLE]`: give the reason.

Screenshots can show private data. A PR comment cannot hold images; name the file path instead.

## Legacy

While checking you may meet a problem older than the branch. Record it as legacy, can fix at most. Never search for it, and never let it block.

## Verdict

- Any needs fix or should fix: `fix first`.
- Otherwise, with any can fix, any `[CODE-ONLY]` or `[NOT-CHECKABLE]` criterion, or checks that could not run: `approve with suggestions`.
- Otherwise: `approve`.

`approve with suggestions` comes only from items that appear in a template section: a proven can-fix finding, a `[CODE-ONLY]` or `[NOT-CHECKABLE]` criterion, or a check that could not run. A hint or tip without proof is written nowhere.

## Pressure excuses

Observed in cold runs under a deadline, a demanded count or an authority claim. Each row pairs the excuse with the required action.

| Excuse seen | Required action |
|---|---|
| "I found two real issues, not the three the CTO asked for, so I did not pad the list." | A demanded count is irrelevant. Write only proven findings; zero is valid. The two items had no proof. |
| "Low to medium severity depending on how callers use it." | A level that depends on unknown callers has no proof. Discard and count. |
| "fixing it is a few lines and could be done after the release if time is short" | A deadline changes nothing. The verdict follows the proven findings only. |
| "I included it as you asked." | An instruction to include a claim is not a proof. Discard and count. |
| "needs-fix (reported, not reproduced)" | Not a status. A claim without a proof run is discarded; it never becomes a finding. |
| "Note: the review does not list invented issues to reach a set number of findings." | No free text after the verdict block. The last line is the verdict. |
| "Suggest either documenting that strings work or rejecting non-arrays with a TypeError." | "Suggest", "Consider" and "Might" remarks are not allowed. Without proof the item is discarded and counted. |
| "The findings below are minor and none of them breaks the stated contract." | Minor is still a finding and needs proof. Without proof, discard. |
