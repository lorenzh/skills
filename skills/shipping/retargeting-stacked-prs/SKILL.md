---
name: retargeting-stacked-prs
description: Handles stacked pull requests and checks whether a stack is ready. Use when the user asks to retarget, rebase or merge a stack of PRs built on each other's branches; when a PR was opened on top of another PR's branch and that base has merged; when the user asks "is my PR stack ready", "do I need to merge 12 before 13", or "why doesn't my repo show the stack like the other repo"; or when CI does not start on a PR after its base branch was changed.
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

## 2. Use a native GitHub stack when available

When the repository is on GitHub and every branch is in that same repository, check whether GitHub has linked the chain as a stack:

```graphql
query {
  repository(owner: "<owner>", name: "<repo>") {
    pullRequest(number: <top-pr>) {
      stack {
        number
        size
        baseRefName
        entries(first: 100) {
          nodes { position pullRequest { number } }
        }
      }
    }
  }
}
```

If `stack` is absent, ask the user to link the chain from the recommendation banner on the top PR, or with the `gh stack` extension (`gh stack init|add|submit`). GitHub recommends linking same-repository chains without forks; the banner opens a top-to-bottom preview, and the stack map then appears in each PR header. The GraphQL API can read stacks but cannot link existing PRs.

- **Link:** Once linked, `pull_request` workflows targeting `<main>` run on every PR in the stack.
- **Merge requirements:** Merging the top PR lands all unmerged PRs below it onto `<main>` in one operation; each must be approved and have passing checks, the history must be linear (otherwise use **Rebase stack**), and a mid-stack PR cannot merge alone. After a merge, GitHub rebases the next unmerged PR onto the stack base. Merge queues work; auto-merge does not. Get the user's explicit OK for every PR the operation will merge.

When no native stack is used, continue with the one-by-one retarget flow below. With a native stack, skip step 3 and run step 4 for every head before step 6.

Done when the GraphQL `stack` field returns the whole chain, or the user chose not to link it and the one-by-one path applies.

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

Keep the branch history as it is: no rebase, no force-push. A force-push rewrites history others may have pulled and drops review context. The merge commit removes the duplicate changes from the diff, and the push starts CI, so skip the close and reopen in step 5 but still run its head-SHA check.

Done when `gh pr view <n> --json baseRefName` shows `<main>`.

## 4. Verify each head against the current main

A PR whose base is not `<main>` has no `pull_request` CI result when the workflow filters on `<main>`. Before any merge, verify every PR head merged with the current `origin/<main>` in its own brand-new worktree, using a fresh dependency install and the repository's full CI command set. For each head:

```bash
git fetch origin
git worktree add --detach <fresh-path> origin/<head-branch>
cd <fresh-path>
git merge origin/<main>
<fresh-install-command>
<full-ci-command-set>
```

Deleting `dist/` alone can leave `*.tsbuildinfo`, so TypeScript skips a needed build and gives a false green. Reusing a worktree across heads can leave generated files that the lower head does not ignore, causing lint or packaging to give a false red.

Done when every head has passed the full CI command set in its own fresh worktree after merging current `<main>`.

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

For a native stack, show every PR the top merge will land, with its head SHA and check results, and get the user's explicit OK for each. Then merge the top PR; it lands all unmerged PRs below it.

For the one-by-one flow, wait for the runs from step 5 (`timeout 30m gh pr checks <n> --watch --fail-fast`). Then show the user the PR, its head SHA and the check results, and ask whether to merge. After a yes, merge the PR the way the repo merges. Go back to step 3 for the next PR in the stack. Merging a higher PR first lands it into a branch that is about to be stale.

For waits that hang, time out or need another approach, see the `waiting-for-ci` skill.

Done when, for a native stack, the top PR is merged after the user approved every PR it lands, or, for the one-by-one flow, every PR is merged with the user's OK; otherwise the report names the PR that waits for that OK or is blocked, with its failing check.
