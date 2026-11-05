```bash
#!/usr/bin/env bash
# Update PR 42 from main, wait for green CI on the new head, then squash-merge it.
set -euo pipefail

# Bash reads the whole function before running it, so deleting this file mid-run is safe.
main() {
  # Leave the worktree, which is deleted mid-run; use only --repo and API paths, no local git.
  cd /
  repo=example/app pr=42 expected=3f9c2a7e1b5d48c6a0e2f71b9d3c5a8e4f6b2d10

  # Stop if the PR head is not the expected commit.
  head=$(gh api "repos/$repo/pulls/$pr" --jq .head.sha)
  [ "$head" = "$expected" ] || { echo "head is $head, want $expected"; exit 1; }

  # Update the branch through the REST API (gh 2.20 has no 'gh pr update-branch'); GitHub returns 422 if the head moved.
  gh api -X PUT "repos/$repo/pulls/$pr/update-branch" -f expected_head_sha="$expected" >/dev/null

  # Wait up to 5 min for the update commit to become the new PR head.
  for i in $(seq 1 30); do
    head=$(gh api "repos/$repo/pulls/$pr" --jq .head.sha || true)
    [ -n "$head" ] && [ "$head" != "$expected" ] && break
    sleep 10
  done
  [ -n "$head" ] && [ "$head" != "$expected" ] || { echo "timeout: head still '$head' after update-branch"; exit 1; }

  # Poll check runs and commit statuses on the new head for up to 60 min; stop at the first failure.
  ok=; last=
  for i in $(seq 1 120); do
    runs=$(gh api "repos/$repo/commits/$head/check-runs?per_page=100" --jq '
      if any(.check_runs[]; .status == "completed" and (.conclusion | IN("success","skipped","neutral") | not)) then "failure"
      elif (.check_runs | length) == 0 then "none"
      elif any(.check_runs[]; .status != "completed") then "pending"
      else "success" end' || echo pending)
    status=$(gh api "repos/$repo/commits/$head/status" --jq 'if .total_count == 0 then "none" else .state end' || echo pending)
    last="check-runs=$runs statuses=$status"
    case "$runs $status" in
      *failure*) echo "CI failed on $head: $last"; exit 1 ;;
      "none none"|*pending*) sleep 30 ;;
      *) ok=1; break ;;
    esac
  done
  [ -n "$ok" ] || { echo "timeout: CI on $head not green, last $last"; exit 1; }

  # Squash-merge only if the head is still the commit that passed CI.
  gh pr merge "$pr" --repo "$repo" --squash --match-head-commit "$head"
}

main "$@"
```

Updating the branch creates a new head commit, so green CI on `3f9c2a7…` can't be the merge gate. The script uses that SHA only to confirm the PR hasn't moved before the update. It then waits for green CI on the new head and merges with `--match-head-commit`, so an unchecked commit can't get merged. Copy the script out of the worktree before you start it, and send its log to a path outside the worktree too, for example `nohup bash /tmp/merge-pr42.sh >/tmp/merge-pr42.log 2>&1 &`.

I did not run or test the script, as you asked. I also have not confirmed that gh 2.20 has `--match-head-commit`; I recall it was added before 2.20. If a later workflow registers only after the earlier checks have passed, the script can still merge early, and only branch protection on required checks would stop that.
