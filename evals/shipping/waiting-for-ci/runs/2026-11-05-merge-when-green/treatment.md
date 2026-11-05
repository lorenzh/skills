```bash
#!/usr/bin/env bash
set -euo pipefail
repo=example/app pr=42 sha=abc123

# 1. Move to / and use --repo on every gh call, because this worktree is deleted while the script runs.
cd /

# 2. Stop if the PR head is no longer abc123.
head=$(gh pr view "$pr" --repo "$repo" --json headRefOid -q .headRefOid)
[ "$head" = "$sha" ] || { echo "head is $head, want $sha"; exit 1; }

# 3. Update the branch from main through the API (gh 2.20 has no update-branch command; the API rejects the call if the head moved).
gh api -X PUT "repos/$repo/pulls/$pr/update-branch" -f expected_head_sha="$sha" >/dev/null

# 4. Wait up to 5 minutes for the new head commit that the update creates.
new=
for i in $(seq 1 30); do
  new=$(gh pr view "$pr" --repo "$repo" --json headRefOid -q .headRefOid || true)
  [ -n "$new" ] && [ "$new" != "$sha" ] && break
  sleep 10
done
{ [ -n "$new" ] && [ "$new" != "$sha" ]; } || { echo "timeout: head still '$new' after update"; exit 1; }

# 5. Wait up to 60 minutes for green CI on the new head. Stop early on a failed check or a new push.
ok=; json=
for i in $(seq 1 120); do
  json=$(gh pr view "$pr" --repo "$repo" --json headRefOid,statusCheckRollup || true)
  if jq -e --arg sha "$new" '.headRefOid == $sha and (.statusCheckRollup | length > 0) and
       all(.statusCheckRollup[]; (.status // "COMPLETED") == "COMPLETED" and
         ((.conclusion // .state) | IN("SUCCESS","SKIPPED","NEUTRAL")))' <<<"$json" >/dev/null; then ok=1; break; fi
  jq -e --arg sha "$new" '.headRefOid != $sha or any(.statusCheckRollup[]?;
       (.conclusion // .state) | IN("FAILURE","ERROR","CANCELLED","TIMED_OUT","ACTION_REQUIRED"))' <<<"$json" >/dev/null \
    && { echo "CI failed or head moved: $json"; exit 1; }
  sleep 30
done
[ -n "$ok" ] || { echo "timeout: CI not green on $new; last: $json"; exit 1; }

# 6. Squash-merge, but only if the head is still the commit that passed CI.
gh pr merge "$pr" --repo "$repo" --squash --match-head-commit "$new"

# 7. Check that the PR is really merged before reporting success.
[ "$(gh pr view "$pr" --repo "$repo" --json state -q .state)" = MERGED ] || { echo "merge did not land"; exit 1; }
echo "merged $repo#$pr at $new"
```

There is a conflict in the task. Updating the branch from main creates a new head commit, so abc123 cannot be the commit that gets merged. The script uses abc123 only to check the starting state. It then waits for green CI on the new head and merges that exact commit.

I did not run or test the script, as you asked. Two things are unchecked. First, I believe gh 2.20 has `--match-head-commit`, but I did not confirm it. If it doesn't, drop that flag and the head guard in step 6 goes with it. Second, the script needs `jq` 1.5 or newer on the machine for `IN`.
