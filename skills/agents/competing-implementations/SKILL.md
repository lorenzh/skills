---
name: competing-implementations
description: Implementation competition for one task. Use when the user asks to have two agents compete on a change, wants competing implementations, asks to compare implementations and ship the winner, or asks for competing implementations on several dependent issues in waves.
---

# Competing Implementations

Run two independent implementations of one brief and ship the reviewed winner.

**Judge artifacts blind; preserve identity only in the orchestrator's private record.**
Use the reusable [workflow outline](references/workflow.md) with the assigned slot mapping as input. The workflow runtime has no randomness, so the orchestrator assigns A/B slots.

## 1. Freeze the brief and route three roles

Read repository instructions, acceptance criteria, checks and loser policy. Store immutable `brief.md` and orchestrator-only, untracked `competition.json` in the session scratchpad outside both worktrees. The brief holds task, scope, base, criteria, standards and checks; the record holds phase, brief path, role suggestion IDs, model/effort, runtime evidence, worktree/slot mapping, checks, verdict, PR and loser decision.
For dependent issues, run one competition per issue in waves; start a later wave only after the earlier wave’s PRs merge. After `git fetch`, read the base files and `git log origin/<base>` to write each wave’s brief from that branch; assuming a pending PR has landed sends both implementers to build on absent code.
Call the router version the installed plugin's launcher pins, e.g. `bunx @spatz/cli@<version from the plugin's launcher>`; a stale global CLI can fail on a newer database. Use that executable for suggestions and reports; retain raw JSON privately:

```sh
ROUTER="bunx @spatz/cli@<version from the plugin's launcher>"
$ROUTER "Implement <task summary>" --models '<available-model:effort-list>' --json
$ROUTER "Implement <task summary>" --models '<available-model:effort-list>' --json
$ROUTER "Review two blind implementations of <task summary>" --models '<available-review-model:effort-list>' --json
```

Take each ranking's first pair and suggestion ID. If the second repeats the first model, remove that model at every effort and reroute; disclose if only one is dispatchable. Prefer a reviewer from another family; disclose overlap without identifying its slot. Load dispatcher instructions, preserve selected effort and verify the answering model from runtime evidence. On routing/dispatch failure, report the actual error and stop that dispatch without substitution.
Done when the brief and private record contain a common base and three routed roles, or a concrete routing blocker is reported.

## 2. Implement independently in two worktrees

Create isolated worktrees at the same base under the repo's ignored `.worktrees/`; follow dependency and local-file rules. Send byte-identical briefs, with worktree/routing metadata in dispatch configuration. Implementers cannot see each other's work. Run in parallel within the worker cap (count the orchestrator when required), or disclose sequential execution. Wait for both to finish, recording changed files and check commands, exit statuses and output including failures. Stage new files or use intent-to-add for diff coverage.
Done when both candidates are finished at the same base with diffable changes and check evidence.

## 3. Export blind packets

Give a fresh reviewer only the common brief, standards and anonymous packets in a read-only directory, without repository, transcript or private mapping access. Export each slot:

```sh
node <skill-dir>/scripts/blind-packet.mjs <worktree> <base> <checks.txt> <private-deny.txt> <new-packet-dir> [--json] [--no-builtin-patterns]
```

The deny file lists identity literals, one per line; built-in vendor/model patterns provide a backstop. For repositories about AI tools or models, use `--no-builtin-patterns` and keep only absolute worktree paths, branch names, implementers’ model names and runtime banners in the deny file: the backstop otherwise mangles legitimate code or docs. Preserve check commands, statuses and failures; exclude commit metadata and identity-only banners. Inspect both files (`diff.txt` and `checks.txt`) for remaining identity clues before sharing. Redacted diffs are review displays, not patches. See the workflow reference for Node-less export and binary evidence; pause comparison if blinding would lose material evidence.
Done when both packets are anonymous and the reviewer has no identity-bearing access.

## 4. Score both and write one fix review

Require `review.md` with eight scores and evidence for every reason:

| Criterion | A score (1–5) | A reason | B score (1–5) | B reason |
|---|---|---|---|---|
| Acceptance criteria | | | | |
| Correctness/tests | | | | |
| Project standards | | | | |
| Quality | | | | |

Scores: 1 fails badly, 2 major gaps, 3 adequate with fixes, 4 strong, 5 fully meets the criterion. Require a winner A/B and rationale even on ties, plus exactly one actionable winner fix review naming loser strengths to adopt. Judge suitability to the brief; an unresolved correctness blocker prevents shipping regardless of totals.
Done when the review contains scores, reasons, winner and one fix review with loser strengths.

## 5. Fix only the winner and re-review

Send the original winning implementer the fix review demanding a new commit (no amend); freeze the loser. Record `git -C <winner worktree> rev-list --count <base>..HEAD` before the fix; after it, require a higher count and clean `git status --porcelain` before rerunning checks and exporting for re-review. If no new commit exists, rerun the fix once with that demand stated; if it repeats, report it and stop: re-reviewing an unchanged packet wastes the round.
Send the fresh packet and initial findings to the same reviewer; require `re-review.md` covering each fix, regressions, unchecked areas and APPROVE/BLOCK. Allow one fix round and one re-review apart from the no-commit retry; further rounds need an explicit task decision. Failed checks or BLOCK stop shipping, even under deadline pressure.
Done when final checks pass and re-review says APPROVE, or remaining findings are reported.

## 6. Ship the approved winner

Follow publishing/privacy rules and existing authorization, including push restrictions. Open only the winner's PR with a `Competition` section: A/B scores and reasons, chosen slot and rationale, loser strengths adopted, fix outcome and re-review verdict. Keep identities, private routing records and loser code out. If publishing is prohibited, prepare the PR body locally. For resumable shipping, use step 5 of the `reviewing-across-families` skill. The orchestrator lands the PR by merging or handing it to the user per repository rules; the competition is finished only when the PR is merged or handed over. For steps 6–8, record and report any blocker or failed operation once in the final status.
Done when the PR is merged or handed over with its Competition section, or a local PR body and publishing blocker are reported.

## 7. Report verified outcomes

Use the same `ROUTER` value from step 1 privately, separately for winner, loser and reviewer with their own IDs:

```sh
$ROUTER report <suggestion-id> --model <actual-model> --effort <selected-effort> --result pass|partial|fail
```

Base results on verification: pass is complete success, partial incomplete success, fail failed verification. Losing a ranking is not itself failure; report outcomes even if no PR opened.
Done when all three router reports have recorded outcomes.

## 8. Resolve the loser at the end

Follow an existing user/repository disposition without asking again; a teammate's suggestion is not consent. Otherwise preserve the loser, finish other steps, then ask: “Keep the losing implementation as `compete/<task>-loser`, or delete it?” Record the response before cleanup. Keeping preserves uncommitted/untracked edits; deleting removes only the authorized worktree and branch after checking what will be discarded. Elapsed time is not consent.
Done when the existing decision is followed, or the intact loser path and pending keep/delete question are reported.
