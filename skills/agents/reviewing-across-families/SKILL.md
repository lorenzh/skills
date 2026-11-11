---
name: reviewing-across-families
description: Cross-family review loop for agent-written changes. Use when one model wrote a change and a model of another family (for example GPT through Codex CLI after Claude, or Claude after GPT) should review it before it ships, when the user asks for a "second opinion", "cross-family review" or "independent review" of an agent's diff, or when an orchestrating session must take a reviewed branch to a merged pull request.
---

# Reviewing Across Families

One model family implements, another reviews read-only, the implementer fixes, and the orchestrating session ships.

**A review counts only when the runtime proves the reviewer came from the other family, and only the orchestrating session pushes, opens the PR and merges.**

Roles, fixed for the whole loop:

| Role | Who | Writes |
|---|---|---|
| Orchestrator | The main session that holds the user's intent | The review brief, the round log, the push, PR and merge |
| Implementer | An agent of family A (a pinned subagent, a CLI run) | Code and tests in the worktree, nothing else |
| Reviewer | An agent of family B, read-only sandbox | One review file per round |

Pick the implementer and reviewer models yourself or let a model router choose them; the rule is only that the families differ. Dispatch each through whatever the harness offers: a subagent pinned to a model, or a CLI such as `codex exec -m <model> -s read-only -C <worktree> -o <review file> - < <brief>`. An implementer subagent stops at committed, tested code and reports back: auto-mode safety checks often block a subagent's merge ("merge without review"), and a push or PR it makes skips your final checks.

## 1. Brief the reviewer

Write the brief to a file. It holds: the base and head (`git diff origin/<base>...HEAD`), the issue text, what the change claims to cover and what it leaves out, the test command and its last result, and this output contract:

```
MODEL: <the model id you are running as>
FINDINGS:
- [needs-fix|should-fix|note] path:line: defect. Severity: P1|P2|P3. Proof: <failing test, or command and its failing output>. Failure: <input or state> -> <wrong result>.
NOT CHECKED: <what you could not verify: images, video, live services, network>
VERDICT: fix first | ship
```

Rules for the reviewer, put in the brief as written:

- You may find nothing. There is no minimum number of findings; "no blocking findings" is a valid result.
- **needs-fix**: severity P1 or P2, proven by a mechanical test (a failing test, or a command with its failing output). It blocks the PR.
- **should-fix**: proven the same way, but not blocking (P3 or minor impact). The PR may merge; the orchestrator opens a separate issue linked to the PR, and the fix follows after the merge.
- **note**: unproven suspicion, style, nits, residual risk. A note changes nothing and gets no issue.
- Severity: P1 breaks data, security or the main flow for most users. P2 breaks documented behavior in a realistic case. A corner case that needs a contrived input is P3.
- A finding without proof is a note.
- The verdict is `fix first` only when a needs-fix finding exists, otherwise `ship`. The reviewer may not edit files.

Done when the brief file exists and contains the contract.

## 2. Run the review and check who answered

Run the reviewer in the background and wait for it to exit; a piped `head` or a short timeout cuts the verdict off. Then read the runtime's own record of the model (the CLI header such as `model: gpt-...`, or the pinned agent's model field) and the reviewer's `MODEL:` line.

- Runtime record shows the other family: the review counts. Trust the runtime over the self-report, which is often wrong (a GPT model writing "I am Claude" after reading a Claude-heavy prompt), and report both values.
- Runtime record shows the same family, or there is none: the review does not count. Tell the user the selected model was unavailable; do not substitute another model or call the review independent.

Append one entry per round to `review-log.md` in the orchestrator's scratch space: `Round <n>: runtime=<model> self=<model> verdict=<...> findings=<ids and severities>`.

Done when the log entry exists with both model values.

## 3. Fix at the root

Send every needs-fix finding to the implementer (reuse its session when it still exists), with the reviewer's failure scenario. The brief demands a new commit per finding: do not amend or rebase. The implementer fixes the shared cause, ships the test that failed on the old code, and reports SHAs and test results. The orchestrator does not edit code: its fix would reach main without family-B review. Should-fix findings wait for a fix after the merge and notes change nothing: the orchestrator opens one issue per should-fix finding, linked to the PR.

Apply this commit gate to delegated fixes. Before reporting completion or starting re-review, run these checks in the implementer's worktree:

```
git -C <worktree> merge-base --is-ancestor <reviewed SHA> HEAD
git -C <worktree> rev-list --count <reviewed SHA>..HEAD
git -C <worktree> status --porcelain
```

Require ancestry exit 0, a count above 0 and empty porcelain output. An amend or rebase can rewrite the reviewed commit. A CLI can also answer "fixed" without changes or leave them uncommitted. If any check fails, rerun the fix once. The retry brief demands new commits per finding and empty porcelain output. It also states: no amend or rebase. If any check fails again, report it to the user and stop before re-review. The orchestrator does not commit, stash or discard the implementer's changes.

Tests that time out under machine load: rerun once; a second timeout goes to the user as a timeout, not a pass.

Done when ancestry exits 0, the count is above 0, porcelain is empty, and tests pass.

## 4. Re-review the delta

Give the reviewer its earlier review file and the diff since the reviewed SHA. It marks each earlier needs-fix finding `resolved` or `open` with evidence, then checks the new commits for new needs-fix defects. It does not hunt for new notes or should-fix findings: reopening settled code adds rounds without adding safety.

Stop after 3 rounds (tunable). If a needs-fix finding is still open, report it to the user with the log instead of starting round 4.

Done when the log ends in `ship`, or in a round-limit entry handed to the user.

## 5. Ship from the orchestrating session

Shipping fails halfway in practice (a lost network, a text-substitution error after the PR already exists), so it runs as a script that checks each step's state and resumes on rerun. Decide the issue link first: `fixes` only when the change closes the whole issue, otherwise `refs` — a `Fixes #N` in the PR body, a commit message or the squash body closes the issue on merge.

```
node <skill dir>/scripts/ship.mjs --dir <worktree> --issue <n> --link fixes|refs --title "<title>" \
  --body-file <pr-body.md> [--changelog "- <line> (#PR)"] [--merge]
```

Run it from anywhere, with `<skill dir>` the folder holding this file; `--help` prints the options. It fetches and rebases onto fresh `origin/<base>` (a fetch failure stops it: ship from a machine with network), pushes, reuses an open PR or creates one, rewrites the PR body, adds the changelog line with the real PR link, watches CI, squash-merges with `Fixes|Refs #N` as the squash body, and checks the issue state. It refuses a `refs` run whose title, body or commit messages close the issue. A run that had to rebase stops before the merge: rerun the tests, run step 4 once more if the rebase changed the diff, then rerun the command. On failure it names the step: fix that, then rerun the same command. Without Node, do the same steps by hand in that order and check each before the next.

For manual shipping, push with `git push origin HEAD:<pr-branch>`; confirm `git ls-remote --heads origin <pr-branch>` matches `git rev-parse HEAD`.
F9 measured one wrong-branch push: `git push origin HEAD` used the local worktree branch name.
The bundled script targets the local branch; use it only when that name matches the intended PR branch.

Put in the PR body the reviewer's runtime model, the round count, and the review's NOT CHECKED line, so the reader knows what no reviewer verified.

Done when the script prints `merged <url>` and the issue state it reports matches the link kind.
