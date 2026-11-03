---
name: landing-parallel-prs
description: Merging a batch of independent pull requests that touch the same file, none built on another's branch. Use when two or more PRs each add to a shared list, index, README table or changelog and must all be merged, when merging one PR made the next one conflict, or when the user asks to merge or ship a batch of parallel PRs.
---

# Landing parallel PRs

Merge a batch of PRs that edit the same lines one at a time, bringing each next PR up to date just before its merge.

**Each merge changes main under the next PR. Update a PR from main right before you merge it, not once for the whole batch.**

**Each merge needs the user's explicit OK, asked right before that merge with the PR number and head SHA.** A merge lands code on main and cannot be taken back cleanly; approval for the batch does not cover a PR whose head changed after the update.

## 1. Order the batch

List the PRs and the files each one changes:

```bash
gh pr view <n> --json number,title,headRefName,files -q '[.number,.title,.headRefName,([.files[].path]|join(" "))]|@tsv'
```

Order them: dependencies first, then the user's priority, then oldest first. Files that more than one PR changes are the shared files.

Done when you have the ordered list and the shared files.

## 2. Bring the next PR up to date

For the first PR in the list that is not merged:

```bash
git fetch origin
git switch <branch> && git merge origin/<main>
```

In a shared list, keep both sides of each conflict: main's entries, then this PR's entries, with each change once.

Run the repo's checks using step 3's failure rules. Then push normally. Keep the branch history as it is, with no rebase and no force-push: a force-push rewrites history others may have pulled.

GitHub can report `UNKNOWN` after a push or a merge to main. Decide that a PR conflicts only when this bounded loop returns `CONFLICTING`:

```bash
for i in $(seq 1 20); do
  m=$(gh pr view <n> --json mergeable -q .mergeable)
  [ "$m" != UNKNOWN ] && break
  sleep 6
done
echo "$m"
```

`CONFLICTING` means main moved again: repeat this step. `UNKNOWN` after the loop is a timeout: report it and stop the batch.

Done when the merge commit is pushed and the loop printed `MERGEABLE`.

## 3. Wait for checks on the new head

Wait in the background with a deadline, not by checking by hand:

```bash
sha=$(gh pr view <n> --json headRefOid -q .headRefOid)
timeout 30m gh pr checks <n> --watch --fail-fast
gh run list --commit "$sha" --json workflowName,status,conclusion,createdAt
```

Checks count only when their runs belong to `$sha` and started after the push. A green result from before the update ran on the old main.

If a skill or tool for bounded waits or CI diagnosis is available, use it. Keep an observable end condition and deadline; use the harness background option, record the job ID and log, and inspect actual state if silent. If no available capability can own the wait or diagnosis, name the gap and ask how to proceed.

Before changing the PR, read raw job logs with `gh api repos/{owner}/{repo}/actions/jobs/<job-id>/logs`. Compare the failure with the diff and the default branch's same workflow. If the default branch fails the same test, report that and leave the PR unchanged. Run the failing test locally 5 times (tunable). For an unrelated failure or a transient timeout/network failure, rerun only failed jobs once with `gh run rerun <run-id> --failed`. Watch with a deadline; report a second failure with its log. If the unrelated test passes, offer a flaky-test issue instead of changing the PR.

For local test timeouts under machine load, rerun once. Report a second timeout to the user as a timeout, never a pass.

Done when every required check for `$sha` passed, or the report names the failing check and stops the batch.

## 4. Merge with the user's OK

Show the user the PR, `$sha` and the check results, and ask whether to merge. After a yes, merge exactly that commit, with the repo's merge method (`--merge`, `--squash` or `--rebase`):

```bash
gh pr merge <n> --merge --match-head-commit "$sha"
```

`--match-head-commit` refuses the merge if the head moved after the approval and the checks. If it refuses, go back to step 2: the new head needs its own checks and its own OK.

A merge queue or auto-merge can return before the PR is merged. If the user merges themselves, use the same wait. Use the same bounded background procedure and confirm `MERGED` before updating the next PR:

```bash
timeout 30m bash -c 'until [ "$(gh pr view <n> --json state -q .state)" = MERGED ]; do sleep 30; done'
```

If the wait times out, report the PR's state and stop the batch. Then go back to step 2 for the next PR.

Done when every PR in the batch is merged, or the report names the PR that waits for the user's OK or is blocked.
