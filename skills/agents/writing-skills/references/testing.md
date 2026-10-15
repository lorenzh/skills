# Testing

Choose checks from observable predicates; preserve evidence of actions rather than paraphrases of instructions.
Every check batch and fix round spends the core's global budget, using its definitions.
The run counts below define one check batch; they grant no additional review or fix rounds.

## Tiers

Apply the first matching row.

| Tier | Observable predicate | Required evidence |
|---|---|---|
| T2 | A discipline rule, irreversible action, or observed description collision exists. | Full eval: 3 same-model pairs; `evals.json`. |
| T0 | Triggers are unchanged, and the skill is pure reference or the change adds no instruction. | Validator output only; no model run. |
| T1 | Neither row above matches, including any added or changed trigger. | One cold with-skill run per observed failure; 2 trigger probes; commit message. |

Pure reference supplies facts without prescribing actions.
An irreversible action cannot be undone through the workflow's available recovery steps.
A description collision occurs when a query loads the wrong neighboring skill or both skills for one distinct task.
Scripts receive deterministic tests instead of model runs for their code behavior.
Instructions that call a script still follow the selected tier.
Keep existing `evals.json` files even when an edit selects a lower tier.

## 1. Prepare the evidence

Use lived session failures as the spec; no additional control run is needed for them.
For an instruction with no lived failure, use a control run to justify keeping it.
For a new skill, the control omits the skill; for an edit, the control uses the prior version.
If that control succeeds, remove the unsupported instruction or label the case as regression coverage.
Keep the prompt, files, model, environment, expected result, and observed result for each case.
Done when every case has inputs and expected behavior, with lived evidence or a control verdict.

## 2. Run the selected behavioral checks

A cold run starts a fresh agent session with task inputs and the skill, without the author's explanation or earlier conversation.
For T1, run one cold with-skill case per observed failure.
For T2, run 3 case pairs on the same model, prompt, files, and environment within each pair.
Each pair compares control behavior with with-skill behavior.
If a case has lived control evidence, reuse it; do not run an additional control.
Count it as same-model evidence only when the model identity matches.
If that identity is missing or different, report the pair as unverified; retain the lived failure in the spec.
For T1 and T2, use the smallest model of the current generation the author can reach for at least one cold with-skill case.
Record the actual model identity; if no model execution is reachable, record that check as unavailable.
For discipline cases, use the discipline reference's pressure checks within this batch.
Judge the action and artifact against expected behavior, not the agent's description of the skill.
Quote the decisive transcript line, output file content, or command output.
Record pass/fail, elapsed time, and token cost when available.
Done when every selected case has a verdict and evidence, including the smallest-model result or explicit unavailability.

## 3. Probe discovery

For T1, use exactly 2 fresh trigger probes: one real request and one near-miss.
Show the installed descriptions; do not name the target skill in the request.
The real request must load the target; the near-miss must select its correct neighboring skill or no skill.
If either probe exposes a description collision, select T2 before tuning the description.
Only an observed description collision enables the larger trigger set.
For that set, write 20 realistic queries: 10 real requests and 10 near-misses sharing vocabulary with neighboring skills.
Run each query 3 times in fresh sessions; record the expected and selected skill for all 60 runs.
Separate 12 tuning queries from 8 held-out queries, preserving half near-misses in each group.
Check held-out queries after tuning; keep their wording fixed.
Description fixes and their delta checks use the remaining global budget.
Done when the required probes have recorded selections and every mismatch has a finding ID.

## 4. Persist the results

For T1, include prompts, inputs, model, verdicts, decisive evidence, and the ledger in the commit message.
If no commit is requested, provide that text in the handoff without creating a commit.
For T2, write `evals/<category>/<name>/evals.json`, outside the installed skill folder.
Each scenario has `prompt`, `files`, `expected`, and `lived` fields.
Use `lived` for verbatim failure evidence and its source; use `null` for a synthetic control case.
Store result evidence with the scenarios or in linked run artifacts; include models, verdicts, and ledger entries.
If owned-file limits forbid eval files, report the missing T2 evidence instead of creating an unauthorized file.
Done when tier evidence is recorded in its required destination, or a file-scope limit is explicitly handed off.

## 5. Review the findings

Review contradictions, duplicated authority, skipped conditions, and incorrect claims about bundled files.
For each finding, record ID, violated requirement, `input → wrong result`, evidence, proposed fix, and verification result.
If another model family is available, it can review; independent review is optional.
Classify failed behavior as absent instruction, ambiguous instruction, missed instruction, or deliberate override.
Use that classification to choose the smallest fix within the remaining global budget.
Round 2+ checks only earlier findings and regressions caused by their fixes.
Done when the ledger records closed findings with evidence and the handoff identifies every open finding.
