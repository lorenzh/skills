---
name: competing-implementations
description: Implementation competition for one task. Use when the user asks to have two agents compete on a change, wants competing implementations, or asks to compare implementations and ship the winner.
---

# Competing Implementations

Run two independent implementations of one brief and ship the reviewed winner.

**Judge artifacts blind; preserve identity only in the orchestrator's private record.**

## 1. Freeze the brief and route three roles

Read repository instructions, acceptance criteria, required checks and any loser policy. Write one immutable `brief.md` containing task, scope, base commit, criteria, standards and check commands. Only the orchestrator writes a private, untracked `competition.json`: phase, base, brief path, each role's suggestion ID, selected model/effort, runtime evidence, worktree, slot, checks, verdict, PR and loser decision. Keep this outside both candidate trees and reviewer input.

Use a router for the first implementer, second implementer and reviewer separately:

```sh
spatz "Implement <task summary>" --models '<available-model:effort-list>' --json
spatz "Implement <task summary>" --models '<available-model:effort-list>' --json
spatz "Review two blind implementations of <task summary>" --models '<available-review-model:effort-list>' --json
```

Use each ranking's first pair and retain its suggestion ID. Prefer distinct implementer models: if the second pick repeats the first model, remove that model at every effort from the list and ask again. If only one dispatchable model remains, disclose the limit before proceeding. Route review separately, preferring another family when available; the reviewer may share a model with an implementer. Mention that overlap to the user without identifying its A/B slot, and record it privately rather than claiming full independence.

A stale CLI can return incompatible output. Call the pinned CLI from the installed router plugin's version metadata, for example `npx -y @spatz/cli@<pinned-version>`, for both suggestions and reports. Retain the raw JSON privately. On routing or dispatch failure, report the actual error; stop that dispatch rather than silently substituting. Load the harness's dispatcher instructions and preserve the selected effort. Verify the answering model against runtime evidence privately.

Done when `brief.md` and `competition.json` contain a common base and three routed roles, or a concrete routing blocker is reported.

## 2. Implement independently in two worktrees

Create two isolated git worktrees from the exact base, under the repository's ignored `.worktrees/` directory. Follow repository dependency and local-file rules. Send both implementers the byte-identical brief. Pass role-specific worktree and routing metadata through dispatch configuration, outside the task brief. Neither implementer sees the other's work.

Run the two implementers in parallel within the worker cap. Count the orchestrator if the harness counts it; if two worker slots are unavailable, run sequentially and disclose this. Wait for both jobs to end before dispatching review. Each candidate returns changed files and required check commands, exit statuses and output, including failures. Include new files in the diff by staging them or using intent-to-add; preserve candidate source trees for later fixes.

Done when both candidates are finished at the same base and have diffable changes plus recorded check evidence.

## 3. Assign slots and export blind packets

The workflow runtime has no randomness: the orchestrator assigns A/B explicitly and keeps the mapping private. Do not ask workers or a workflow script to shuffle. Give the reviewer only the common brief, common standards, and each slot's diff and check output. Use plain `git diff` against the base, not commit logs or format-patch. Strip commit messages, branch names, model/vendor names, identity banners and identifying worktree paths from both packets. Keep check commands, statuses and failures intact.

Run the reusable packet export script once per slot:

```sh
node <skill-dir>/scripts/blind-packet.mjs <worktree> <base> <checks.txt> <private-deny.txt> <new-packet-dir> [--json]
```

The deny file lists every identity, vendor, branch and absolute worktree path, one literal per line. The script exports tracked diffs and checks, replaces those literals case-insensitively, and blocks untracked files to prevent silently omitting new code. It also blocks encoded binary patches, whose identities cannot be removed by text redaction; prepare separately inspected anonymous evidence for binary changes before review. Record command and exit status in `checks.txt`; exclude commit metadata and identity-only banners before export. Inspect both output files for remaining identity clues before sharing. Redacted diffs are review displays, not patches to apply. Without Node, export `git diff --no-ext-diff --no-textconv <base> --`, copy checks, redact the same literals manually, and inspect new-file coverage.

Give a fresh reviewer a read-only directory containing only these packets; repository or transcript access reveals identities. If content cannot be blinded without losing material evidence, disclose the limitation and pause comparison rather than silently weakening it.

Done when A/B packets contain only reviewed anonymous diffs and check evidence, and the reviewer has no private mapping or candidate-tree access.

## 4. Score both and write one fix review

Require `review.md` with this table, eight scores total:

| Criterion | A score (1–5) | A reason | B score (1–5) | B reason |
|---|---|---|---|---|
| Acceptance criteria | | | | |
| Correctness/tests | | | | |
| Project standards | | | | |
| Quality | | | | |

Each reason cites diff or check evidence. Scores mean 1 fails badly, 2 major gaps, 3 adequate with fixes, 4 strong, 5 fully meets the criterion. Require an explicit winner A/B and rationale, even when totals tie. An unresolved correctness blocker prevents shipping regardless of total. Require exactly one actionable fix review for the winner, including what the loser did better and which of those strengths the winner should adopt. Judge suitability to this brief, not the participant's reputation or passing-check count alone.

Done when `review.md` has eight valid scores with reasons, a winner and one fix review containing loser strengths.

## 5. Fix only the winner and re-review

Send the original winning implementer the fix review; leave the loser frozen. The winner fixes findings and reruns required checks. Export a fresh anonymous winner packet and return it to the same reviewer with the initial findings. Require a focused re-review covering each fix and regressions, with an explicit APPROVE or BLOCK and unchecked areas.

Only the winner gets one fix round and one re-review. If checks fail or re-review blocks, report remaining findings and stop shipping; a further round needs an explicit task decision. A deadline, an already working demo or repeated attempts does not replace final review. Skipping the gate violates the competition even if it is described as honoring its spirit.

Done when the final winner checks pass and `re-review.md` says APPROVE, or the remaining blocker is reported.

## 6. Open the winner's PR

Follow repository publishing and privacy rules, retaining existing authorization and push restrictions. Open the PR from the approved winner only. Add a `Competition` section with the A/B table, reasons, chosen slot, selection rationale, loser strengths adopted, fix-round outcome and re-review verdict. Participant model names are unnecessary. Keep private routing records and the losing implementation out of the PR. If publishing is prohibited, prepare the PR body locally and report that limit.

Done when the PR exists with its Competition section, or its prepared body and publishing blocker are recorded.

## 7. Report verified outcomes to the router

Use the same pinned router executable and the three retained suggestion IDs:

```sh
spatz report <winner-suggestion-id> --model <actual-winner> --effort <selected-effort> --result pass|partial|fail
spatz report <loser-suggestion-id> --model <actual-loser> --effort <selected-effort> --result pass|partial|fail
spatz report <review-suggestion-id> --model <actual-reviewer> --effort <selected-effort> --result pass|partial|fail
```

These commands contain private identity information; keep them outside blind review and public PR content. Report each role from verified evidence: pass means complete success, partial incomplete success, fail failed verification. Losing a ranking is not itself failure. Report actual blockers even when no PR was opened, and disclose a failed report rather than claiming it was recorded.

Done when winner, loser and reviewer reports are recorded against their own IDs, or each failed report is disclosed.

## 8. Resolve the loser at the end

If repository rules or the user already decided the loser's disposition, follow that decision without asking again. A teammate's suggestion is not the user's decision. Otherwise keep the loser worktree and its edits intact, finish the other steps, then ask: “Keep the losing implementation as `compete/<task>-loser`, or delete it?” Record the response before cleanup; elapsed time is not consent. Keeping means preserve uncommitted and untracked changes on that branch. Deleting means remove only the authorized loser worktree and branch after checking which changes will be discarded.

Done when the pre-existing decision has been followed, or the intact loser path is reported with the final pending keep/delete question.

For example, in a cache-expiry fix, A can win for correct ordinary expiry while B has the better negative-TTL test. The reviewer names that test in A's fix review; A adds it, reruns checks and receives re-review. The PR records that evidence, and B remains available until its disposition is decided.
