---
name: retargeting-stacked-prs
description: Stacked pull request handling after the base PR merges. Use when a PR was opened on top of another PR's branch and that base PR has merged, when the user asks to retarget, rebase or land a PR stack, or when CI does not start on a PR after its base branch was changed.
---

# Retargeting stacked PRs

Move each PR of a stack onto the main branch after its base merges, get CI to run on it, and merge the stack in order.

**Changing a PR's base does not start `pull_request` CI. A retargeted PR needs a new event before its checks are real.**

`<main>` below is the repository's default branch; get it with `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`.

## 1. Map the stack

List the open PRs and their bases:

```bash
gh pr list --state open --json number,headRefName,baseRefName,title
```

Order the stack from the bottom (base is `<main>`) to the top. GitHub retargets a PR on its own when its base branch is deleted at merge, so a PR may already point to `<main>`.

Done when you have the ordered list with each PR's current base.

## 2. Retarget the next PR

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

Keep the branch history as it is: no rebase, no force-push. A force-push rewrites history others may have pulled and drops review context. The merge commit removes the duplicate changes from the diff, and the push starts CI, so skip step 3.

Done when `gh pr view <n> --json baseRefName` shows `<main>`.

## 3. Trigger CI

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

## 4. Merge in order

**Merging needs the user's explicit OK for each PR.** A merge lands code on `<main>` and cannot be taken back cleanly, so a general "get it merged" from earlier in the session does not cover a PR whose diff or base changed since.

Wait for the runs from step 3 (`timeout 30m gh pr checks <n> --watch --fail-fast`). Then show the user the PR, its head SHA and the check results, and ask whether to merge. After a yes, merge the PR the way the repo merges. Go back to step 2 for the next PR in the stack. Merging a higher PR first lands it into a branch that is about to be stale.

Done when every PR in the stack is merged with the user's OK, or the report names the PR that waits for that OK or is blocked, with its failing check.
