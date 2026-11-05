```bash
#!/usr/bin/env bash
set -uo pipefail

# Leave the worktree, because it is deleted while this runs and gh fails without a working directory
cd / || exit 1

# Set the fixed inputs
repo=example/app pr=42 old=3f9c2a7e1b5d48c6a0e2f71b9d3c5a8e4f6b2d10

# Stop if the PR head is no longer the expected commit
head=$(gh pr view "$pr" --repo "$repo" --json headRefOid -q .headRefOid) || exit 1
[ "$head" = "$old" ] || { echo "head is '$head', want $old"; exit 1; }

# Update the branch from main through the API (gh 2.20 has no gh pr update-branch), only if the head is still $old
gh api -X PUT "repos/$repo/pulls/$pr/update-branch" -f expected_head_sha="$old" || exit 1

# Wait up to 5 min for the new head SHA, because the API answers 202 and updates the branch later
new=
for i in $(seq 1 30); do
  new=$(gh pr view "$pr" --repo "$repo" --json headRefOid -q .headRefOid 2>/dev/null)
  [ -n "$new" ] && [ "$new" != "$old" ] && break
  new=; sleep 10
done
[ -n "$new" ] || { echo "branch not updated, head still $old"; exit 1; }

# Poll checks on the new head for up to 60 min; stop on a failure or a moved head; need green twice in a row so a partly registered check set does not count
state=; prev=
for i in $(seq 1 120); do
  prev=$state
  state=$(gh pr view "$pr" --repo "$repo" --json headRefOid,statusCheckRollup 2>/dev/null | jq -r --arg sha "$new" '
    def done: (.status // (if .state == "PENDING" or .state == "EXPECTED" then "PENDING" else "COMPLETED" end)) == "COMPLETED";
    def ok: (.conclusion // .state) | IN("SUCCESS","SKIPPED","NEUTRAL");
    if .headRefOid != $sha then "moved"
    elif (.statusCheckRollup | length) == 0 then "pending"
    elif any(.statusCheckRollup[]; done and (ok | not)) then "failed"
    elif all(.statusCheckRollup[]; done) then "green"
    else "pending" end')
  case $state in
    failed|moved) break ;;
    green) [ "$prev" = green ] && break ;;
  esac
  sleep 30
done
[ "$state" = green ] && [ "$prev" = green ] || { echo "not merging: CI state '$state' for $new"; exit 1; }

# Merge the PR as a squash commit
gh pr merge "$pr" --repo "$repo" --squash
```
