---
name: using-gh-rest
description: GitHub REST fallback for gh commands that fail on repos with Projects (classic) data, plus the REST calls for milestones, state, PRs and guarded merges that gh has no flag for. Use when gh issue view, gh issue edit, gh pr view, gh pr edit or gh pr create fails with a GraphQL error naming projectCards, when the user asks to clear a milestone, close an issue as not planned, retarget a PR or merge only the commit that was approved, or when a milestone, closing keyword or check result on GitHub looks stale.
---

# Using gh REST

Do GitHub issue and pull request work through `gh api` when the porcelain commands fail or have no flag for the change.

**Switch to REST at the first `projectCards` error and read back every write.** A retry hits the same deprecated GraphQL field, and an unread write can report a state that GitHub has not reached yet.

## 1. Spot the error and stop retrying

`gh issue view`, `gh issue view --comments`, `gh issue edit`, `gh pr view`, `gh pr edit` and `gh pr create` ask GraphQL for `projectCards`. On a repo with Projects (classic) data they fail with `GraphQL: Projects (classic) is being deprecated ... (repository.issue.projectCards)`. The same call fails again on every retry.

After the first such error, run every further issue and PR call of the session through `gh api` (step 2). Calls that name their fields with `--json` often still work (`gh issue view <n> --json title,body,comments`); use them when they do.

Done when no `gh issue|pr view|edit|create` call that already failed with `projectCards` runs again, and the next call is a `gh api` call.

## 2. Pick the REST call

[references/commands.md](references/commands.md) has the full table with one command per task: read issue and comments, create issue, labels, milestone, close, create PR, edit PR body, title and base, checks and head SHA, merge, comment. Placeholders `{owner}` and `{repo}` expand inside a git checkout; outside one, write `owner/repo`.

Three rules decide most calls:

- **`-F` sends typed values and files, `-f` sends strings.** Use `-F milestone=12`, `-F milestone=null` and `-F body=@file`; use `-f title='...'` and `-f 'labels[]=bug'`. `-f body=@file` would post the text `@file`.
- **Clear a milestone with `-F milestone=null`.** `gh issue edit` has no `--remove-milestone`; a guessed flag fails and costs a round trip.
- **A PR is also an issue.** Labels, milestone, state and comments of a PR go through `issues/<n>`; title, body, base and merge go through `pulls/<n>`.

Read one value with `--jq`: `gh api repos/{owner}/{repo}/pulls/<n> --jq .head.sha`. Never print `gh auth token` or a raw header dump; a token in the transcript is a leak.

Done when the call is a `gh api` command from the table with `--jq` selecting only the value the next step needs.

## 3. Give each body its own file

Write the body of one PR or issue to its own private file, for example `$(mktemp -d)/pr-<n>.md`, and pass it with `-F body=@<file>`. A shared `body.md` gets overwritten by the next PR's text; the wrong body then ships and its closing keywords close the wrong issues.

After the edit, read the body back and compare it:

```bash
gh api repos/{owner}/{repo}/pulls/<n> --jq .body | diff - "$f" && echo same
```

Done when the diff is empty for the file that belongs to this PR or issue.

## 4. Read back every write

State on GitHub lags for a few seconds after a write, the milestone most often. Re-read the field with `--jq` and report it as applied only when the read shows it:

```bash
gh api repos/{owner}/{repo}/issues/<n> --jq '[.state,.state_reason,.milestone.number,([.labels[].name]|join(","))]|@tsv'
```

If the value is still the old one, wait 5 seconds and read again, up to three times; then report the mismatch instead of the change.

Done when each reported change comes from a read that came after the write.

## 5. Poll the run of the head you pushed

After a push, the checks API still returns the previous head's runs for a short time. Compare the SHA you pushed with the one the API returns before reading checks:

```bash
pushed=$(git rev-parse HEAD)
timeout 5m bash -c 'until [ "$(gh api repos/{owner}/{repo}/pulls/<n> --jq .head.sha)" = "'"$pushed"'" ]; do sleep 5; done'
gh api repos/{owner}/{repo}/commits/$pushed/check-runs --jq '.check_runs[]|[.name,.status,.conclusion]|@tsv'
```

Wait for `completed` on every run with the bounded loops in `waiting-for-ci`. The run list is empty until the workflow starts; an empty list is not a pass.

Done when every check line you report belongs to `$pushed` and shows `completed` with a conclusion.

## 6. Merge with a SHA guard

Merge only the commit the user approved and the checks passed. Name that SHA in the call, so a push after the approval makes the merge fail instead of landing unseen code:

```bash
sha=$(gh api repos/{owner}/{repo}/pulls/<n> --jq .head.sha)
gh api -X PUT repos/{owner}/{repo}/pulls/<n>/merge -f merge_method=squash -f sha="$sha"
```

HTTP 409 means the head moved: go back to step 5 for the new head and ask for a new OK. `merge_method` is `merge`, `squash` or `rebase`; use the way the repo merges. The merge itself needs the user's OK; this skill supplies the call, not the permission.

Done when the response shows `"merged": true` and `gh api repos/{owner}/{repo}/pulls/<n> --jq .merge_commit_sha` returns the SHA.

## 7. Check what the merge was meant to close

A closing keyword (`Closes #12`) closes an issue only when it is in the PR body or a commit message and the PR merges into the default branch. After the merge, read each issue the PR named:

```bash
gh api repos/{owner}/{repo}/issues/<n> --jq '[.state,.state_reason]|@tsv'
```

If it is still open, close it with a comment that names the PR; the body-file rule of step 3 applies to the comment:

```bash
gh api -X POST repos/{owner}/{repo}/issues/<n>/comments -F body=@"$f"
gh api -X PATCH repos/{owner}/{repo}/issues/<n> -f state=closed -f state_reason=completed
```

Use `not_planned` for duplicates and obsolete issues.

Done when every issue the PR was meant to close reads `closed` and the manual closes carry a comment that names the PR.
