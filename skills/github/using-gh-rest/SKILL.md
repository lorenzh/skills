---
name: using-gh-rest
description: GitHub REST fallback when gh porcelain fails with projectCards on repos with Projects (classic) data. Use when gh issue view, gh issue edit, gh pr view, gh pr edit or gh pr create fails with a GraphQL error naming projectCards or "Projects (classic) is being deprecated".
---

# Using gh REST

Do GitHub issue and pull request work through `gh api` when the porcelain commands fail with `projectCards`.

**Switch to REST at the first `projectCards` error and read back every write.** A retry hits the same deprecated GraphQL field, and an unread write can report a state that GitHub has not reached yet.

## 1. Spot the error and stop retrying

`gh issue view`, `gh issue view --comments`, `gh issue edit`, `gh pr view`, `gh pr edit` and `gh pr create` ask GraphQL for `projectCards`. On a repo with Projects (classic) data they fail with `GraphQL: Projects (classic) is being deprecated ... (repository.issue.projectCards)`. The same call fails again on every retry.

After the first such error, run every further issue and PR call of the session through `gh api` (step 2). Calls that name their fields with `--json` often still work (`gh issue view <n> --json title,body,comments`); use them when they do.

Done when no `gh issue|pr view|edit|create` call that already failed with `projectCards` runs again, and the next call is a `gh api` call.

## 2. Pick the REST call

[references/commands.md](references/commands.md) has the full table with one command per task: read issue and comments, create issue, labels, milestone, close, create PR, edit PR body, title and base, checks and head SHA, merge, comment. Placeholders `{owner}` and `{repo}` expand inside a git checkout; outside one, write `owner/repo`.

Three rules decide most calls:

- **`-F` sends typed values and files, `-f` sends strings.** Use `-F milestone=12`, `-F milestone=null` and `-F body=@file`; use `-f title='...'` and `-f 'labels[]=bug'`. `-f body=@file` would post the text `@file`.
- **Clear a milestone:** check `gh issue edit --help`; if it has no `--remove-milestone`, use `-F milestone=null`. A guessed flag fails and costs a round trip.
- **A PR is also an issue.** Labels, milestone, state and comments of a PR go through `issues/<n>`; title, body, base and merge go through `pulls/<n>`.

Read one value with `--jq`: `gh api repos/{owner}/{repo}/pulls/<n> --jq .head.sha`.

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

If the value is still the old one, wait 5 seconds and read again, up to three times (both tunable defaults); then report the mismatch instead of the change.

Done when each reported change comes from a read that came after the write.

## 5. Poll the run of the head you pushed

After a push, the checks API still returns the previous head's runs for a short time. Compare the SHA you pushed with the one the API returns before reading checks:

```bash
pushed=$(git rev-parse HEAD)
timeout 5m bash -c 'until [ "$(gh api repos/{owner}/{repo}/pulls/<n> --jq .head.sha)" = "'"$pushed"'" ]; do sleep 5; done' \
  || { echo "head never reached $pushed"; exit 1; }
gh api --paginate repos/{owner}/{repo}/commits/$pushed/check-runs --jq '.check_runs[]|[.name,.status,.conclusion]|@tsv'
```

`5m` and `sleep 5` are tunable defaults. Hand the wait for the runs to finish to `waiting-for-ci`. The run list is empty until the workflow starts; an empty list is not a pass.

Done when every check line you report belongs to `$pushed` and every required check shows conclusion `success`.

## 6. Merge with the SHA guard

Run the merge as `landing-parallel-prs` describes it: the user's OK names the PR and its head SHA, and the merge names that SHA. When `gh pr merge` fails with `projectCards`, send the REST form. `$pushed` is the SHA checked in step 5 and named in the OK request:

```bash
gh api -X PUT repos/{owner}/{repo}/pulls/<n>/merge -f merge_method=squash -f sha="$pushed"
```

HTTP 409 means the head moved after the OK: the new head needs its own checks and its own OK. `merge_method` is `merge`, `squash` or `rebase`; use the way the repo merges.

Done when the response shows `"merged": true`.
