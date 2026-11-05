The branch update replaces the head commit. After it, `abc123` is no longer the PR head, and CI runs on the new head commit. So the script checks that `abc123` is still the head, updates the branch, waits for green CI on the new head, and merges only that commit.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Target PR, the head commit it must start from, and a log path outside the worktree.
repo=example/app pr=42 sha=abc123 log=${TMPDIR:-/tmp}/merge-pr-42.log

# Leave the worktree and send all output to the log, because the worktree is deleted while the script runs.
cd / && exec >>"$log" 2>&1

# Stop unless the PR head is still abc123, and keep the full SHA for the API call.
head=$(gh pr view "$pr" -R "$repo" --json headRefOid -q .headRefOid)
[[ $head == "$sha"* ]] || { echo "head is $head, want $sha; abort"; exit 1; }

# Update the branch through REST (gh 2.20 has no 'gh pr update-branch'). expected_head_sha rejects a race.
gh api -X PUT "repos/$repo/pulls/$pr/update-branch" -f expected_head_sha="$head" >/dev/null

# Wait up to 5 min for the update to show up as a new head commit.
new=
for i in $(seq 1 30); do
  cur=$(gh pr view "$pr" -R "$repo" --json headRefOid -q .headRefOid) || cur=$head
  [ "$cur" != "$head" ] && new=$cur && break
  sleep 10
done
[ -n "$new" ] || { echo "timeout: head still $head after update-branch"; exit 1; }

# Print "<head> red|pending|green" from all check runs and commit statuses on the PR head.
jq='.headRefOid + " " + ([.statusCheckRollup[] | if (.status // "") != "" then (if .status == "COMPLETED" then .conclusion else "PENDING" end) else .state end] as $s
  | if any($s[]; IN("PENDING","EXPECTED","SUCCESS","SKIPPED","NEUTRAL") | not) then "red"
    elif ($s | length) == 0 or any($s[]; IN("PENDING","EXPECTED")) then "pending"
    else "green" end)'

# Poll CI for up to 60 min. Stop at the first red check, and stop if someone pushes again. Retry after a single API error.
state=
for i in $(seq 1 180); do
  out=$(gh pr view "$pr" -R "$repo" --json headRefOid,statusCheckRollup -q "$jq") || { sleep 20; continue; }
  read -r cur state <<<"$out"
  [ "$cur" = "$new" ] || { echo "head moved to $cur; abort"; exit 1; }
  [ "$state" = pending ] || break
  sleep 20
done
[ "$state" = green ] || { echo "CI on $new is '${state:-unknown}'; not merging"; exit 1; }

# Squash-merge, but only the commit that CI passed on.
gh pr merge "$pr" -R "$repo" --squash --match-head-commit "$new" && echo "merged $pr at $new"
```

Start the script with the harness background option, not `nohup … &`, and keep the script file outside the worktree. The log goes to `/tmp/merge-pr-42.log` (or under `$TMPDIR`).

I did not run or test anything, as you asked. I wrote it for gh 2.20 from memory: I assumed that version supports `--match-head-commit`, `statusCheckRollup` and gojq's `IN`, but I did not check any of them. The merge fails if `main` moves again during CI and the repo requires an up-to-date branch. A PR with no checks at all waits the full 60 minutes and then exits as `pending`.
