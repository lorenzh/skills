# Competition workflow

Input: the immutable brief, common base, required checks, dispatch surfaces, worker cap, publishing/loser policy, and an orchestrator-assigned mapping from slots A/B to candidate worktrees and routed roles. Keep that mapping private; this outline does not shuffle slots.

| Phase | Action | Output / gate |
|---|---|---|
| Waves | For dependent issues, apply step 1’s base-branch gate before each issue’s competition. | Earlier wave merged; next brief reflects fetched base files and log. |
| Route | Use the installed router plugin's launcher-pinned version for two implementers and a reviewer; retain suggestion IDs, efforts and runtime identities privately. | Common brief and private competition record; disclose reviewer overlap. |
| Build | Dispatch the same brief into isolated worktrees at the base, within the worker cap. | Both jobs finished; diff coverage and check commands, statuses and output. |
| Blind | Export each mapped worktree with `blind-packet.mjs`; inspect diff and checks, then isolate reviewer access. | Anonymous A/B packets and common brief/standards only. |
| Review | Score four criteria per slot from 1–5 with reasons; choose a winner and write one fix review including loser strengths. | `review.md` with eight scores, evidence, rationale and actionable fixes. |
| Fix | Original winner completes step 5’s commit gate, reruns checks and exports a fresh packet for the same reviewer. | Passing checks and `re-review.md` with APPROVE; BLOCK stops shipping. |
| Ship | Land only the approved winner per step 6, report all three verified router outcomes, then follow or request loser disposition. | Merged or handed-over PR with Competition section, or local body and publishing blocker; preserve loser until authorized cleanup. |

Record phase outcomes and blockers in the private competition record so interrupted runs resume at the next unfinished gate.

## Node-less blind export

Export `git diff --no-ext-diff --no-textconv <base> --` from each candidate and copy its check evidence. Include new files by staging or intent-to-add before export. Manually redact the deny-file literals and the built-in vendor/model patterns (except for AI-tool repositories per step 3), strip commit metadata and identity-only banners, and inspect both files. Preserve failed checks, commands and exit statuses. Redacted diffs are review displays, not patches.

## Binary changes

The exporter blocks encoded binary patches because text redaction cannot remove identities inside them. Prepare separately inspected anonymous evidence for binary changes, including what changed and relevant check results. With a Node-less export, detect binary changes and apply the same rule. If anonymity would remove evidence needed for correctness review, disclose the limitation and pause comparison.

## Resumable shipping

Only the orchestrator ships; preserve the publishing authorization and anonymous PR body required by step 6.
Use a shipping tool if available; otherwise perform these gates directly, recording state before advancing.

1. Choose `fixes` only for a complete issue fix; otherwise use `refs`. For `refs`, reject closing keywords in titles, bodies and commit messages.
2. Fetch the base; stop on fetch failure. Rebase onto fresh `origin/<base>`.
   After a rebase, stop shipping, rerun tests, and repeat re-review if the diff changed before resuming.
3. Push the intended PR branch with `git push origin HEAD:<pr-branch>`. Confirm `git ls-remote --heads origin <pr-branch>` matches `git rev-parse HEAD`.
   F9 measured one wrong-branch push with `git push origin HEAD`: the local worktree branch name became the remote branch name.
4. Reuse the open PR for that branch or create it; set the anonymous Competition body. Add any required changelog entry with its real PR link.
   Commit and push a changelog change using gate 3, then verify the updated PR head.
5. Watch CI for the exact PR head with a deadline and bounded polling; stop on failure or timeout.
6. Squash-merge only when authorized, using `Fixes #N` or `Refs #N` consistently, or hand the PR to the user.
   After merging, verify the issue state matches the link kind. On failure, name the failed gate and resume only after resolving it.
