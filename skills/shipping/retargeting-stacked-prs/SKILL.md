---
name: retargeting-stacked-prs
description: Handles stacked pull requests and checks whether a stack is ready. Use when the user asks to retarget, rebase or merge a stack of PRs built on each other's branches; when a PR was opened on top of another PR's branch and that base has merged; when the user asks "is my PR stack ready", "do I need to merge 12 before 13", or "why doesn't my repo show the stack like the other repo"; or when CI does not start on a PR after its base branch was changed.
---

# Retargeting stacked PRs

Check a PR stack is ready, merge it as a native GitHub stack or retarget each PR onto main after its base merges, and get fresh CI on every head.

**Changing a PR's base does not start `pull_request` CI. A retargeted PR needs a new event before its checks are real.**

`<main>` below is the repository's default branch; get it with `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`.

## 1. Map the stack

List the open PRs and their bases:

```bash
gh pr list --state open --json number,headRefName,baseRefName,title
```

Order the stack from the bottom (base is `<main>`) to the top. GitHub retargets a PR on its own when its base branch is deleted at merge, so a PR may already point to `<main>`.

Before creating a stacked branch, fetch and branch from the base PR's final head. Confirm its SHA with `gh pr view <base-pr> --json headRefOid -q .headRefOid`. In the measured case, the base gained 5 commits after branching; after its squash merge, merging main caused add/add conflicts in 6 files.

Done when you have the ordered list with each PR's current base.

## 2. Use a native GitHub stack when available

When the repository is on GitHub and every branch is in that same repository, check whether GitHub has linked the chain as a stack:

```bash
gh api graphql -F owner=<owner> -F repo=<repo> -F n=<top-pr> -f query='query($owner:String!,$repo:String!,$n:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$n){stack{number size baseRefName entries(first:100){nodes{position pullRequest{number}}}}}}}'
```

GraphQL has no stack mutation, so the API cannot link an existing chain. If `stack` is absent, tell the user that and ask them to link the chain from the recommendation banner on the top PR, or with the `gh stack` extension: `gh stack link <bottom-pr> ... <top-pr>` links existing PRs, listed bottom to top. GitHub recommends linking same-repository chains without forks; the banner opens a top-to-bottom preview, and the stack map then appears in each PR header.

- **Link:** Once linked, `pull_request` workflows targeting `<main>` run on every PR in the stack.
- **Merge requirements:** Merging the top PR lands all unmerged PRs below it onto `<main>` in one operation; each must be approved and have passing checks, the history must be linear (otherwise use **Rebase stack**), and a mid-stack PR cannot merge alone. After a merge, GitHub rebases the next unmerged PR onto the stack base. Merge queues work; auto-merge does not.

When no native stack is used, continue with the one-by-one retarget flow below. With a native stack, CI runs on every PR, so skip steps 3 and 5; still run step 4 as a local pre-merge check for every head, then go to step 6.

Done when the GraphQL `stack` field returns the whole chain, or the user chose not to link it, or the chain uses forks or a non-GitHub host and the one-by-one path applies.

## 3. Retarget the next PR

For the lowest PR whose base PR has merged and whose base is not yet `<main>`:

```bash
gh pr edit <n> --base <main>
```

If `gh pr edit` fails (some `gh` versions fail on repos with classic projects), use the REST API:

```bash
gh api -X PATCH repos/{owner}/{repo}/pulls/<n> -f base=<main>
```

If the diff now shows the base PR's commits again (the base was squash-merged), merge `<main>` into the branch and push normally:

```bash
git fetch origin
git switch <branch> && git merge origin/<main>   # resolve conflicts, then commit
git push
```

For conflicts after a squash merge, take main's version for files the stacked PR does not own. In shared tables, keep both main's rows and the stacked PR's rows, each once. This resolved the 6 conflict files in the measured case; check the resulting diff before committing.

Keep the branch history as it is: no rebase, no force-push. A force-push rewrites history others may have pulled and drops review context. The merge commit removes the duplicate changes from the diff, and the push starts CI, so skip the close and reopen in step 5 but still run its head-SHA check.

Done when `gh pr view <n> --json baseRefName` shows `<main>`.

## 4. Verify each head against the current main

Verify every head on its own, in a brand-new worktree. Checking only the top head says nothing about the lower PRs, and a reused worktree has two traps; name both when you tell the user why an earlier local pass does not count:

- **False green:** deleting `dist/` alone can leave `*.tsbuildinfo`, so TypeScript skips a needed build.
- **False red:** generated files that a lower head does not ignore make lint or packaging fail.

In an unlinked chain, a PR whose base is not `<main>` has no `pull_request` CI result when the workflow filters on `<main>`, so this run is the only check of that head against `<main>`.

Run it once per head before the first merge, and again for the remaining heads after each loop back to step 3. For each head, merge the current `origin/<main>`, install dependencies fresh and run the repository's full CI command set:

```bash
git fetch origin
git worktree add --detach <fresh-path> origin/<head-branch>
cd <fresh-path>
git merge origin/<main>
<fresh-install-command>
<full-ci-command-set>
cd - && git worktree remove <fresh-path>
```

If a skill or tool for isolated worktrees is available, use it. Install dependencies fresh inside `<fresh-path>`; verify dependency and config paths resolve there, without borrowing the main checkout's install or symlinking it. If no available capability can provide that isolation, name the gap and ask how to proceed.

Done when every head has passed the full CI command set in its own fresh worktree after merging current `<main>`, and `git worktree list` no longer shows those worktrees.

## 5. Trigger CI and check the runs

The base change sends a `pull_request` `edited` event, and most workflows listen only for `opened`, `synchronize` and `reopened`. Old check results stay on the PR and can look green. Start a new run:

```bash
gh pr close <n> && gh pr reopen <n>
```

Or push a commit to the branch. Then confirm that the checks belong to the PR's current head and started after the retarget or push. A green check from before it ran on the old base and proves nothing:

```bash
sha=$(gh pr view <n> --json headRefOid -q .headRefOid)
gh run list --commit "$sha" --json databaseId,workflowName,event,status,createdAt
```

Done when every required workflow has a run for `$sha` with `createdAt` after the retarget or push.

## 6. Merge in order

**Merging needs the user's explicit OK for each PR.** A merge lands code on `<main>` and cannot be taken back cleanly, so a general "get it merged" from earlier in the session does not cover a PR whose diff or base changed since.

For a native stack, wait for the checks of every PR in the stack on its current head SHA (`timeout 30m gh pr checks <n> --watch --fail-fast` for each `<n>`). Show every PR the top merge will land, with its head SHA and check results, and get the user's explicit OK for each. Then merge with `gh stack merge <top-pr> --yes --<squash|merge|rebase>`, using the repo's merge method; `gh pr merge` cannot merge a stack. It lands every unmerged PR up to the top in one all-or-nothing operation. Afterwards confirm that `gh pr view <n> --json state -q .state` prints `MERGED` for every PR it landed; with a merge queue they land one by one as the queue runs.

For the one-by-one flow, wait for the runs from step 5 (`timeout 30m gh pr checks <n> --watch --fail-fast`). Then show the user the PR, its head SHA and the check results, and ask whether to merge. After a yes, merge the PR the way the repo merges. Go back to step 3 for the next PR in the stack. Merging a higher PR first lands it into a branch that is about to be stale.

If a skill or tool for bounded waits is available, use it. Keep an observable end condition and deadline; start long waits through the harness background option and record the job ID and log. If silent, inspect actual state; on timeout, report the last state and stop dependent work. If no available capability can own the wait, name the gap and ask how to proceed.

Done when, for a native stack, every PR the top merge landed shows `MERGED` after the user approved each one, or, for the one-by-one flow, every PR is merged with the user's OK; otherwise the report names the PR that waits for that OK or is blocked, with its failing check.
