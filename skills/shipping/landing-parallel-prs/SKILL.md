---
name: landing-parallel-prs
description: Landing several open pull requests that touch the same file. Use when two or more PRs each add to a shared list, index, README table or changelog and must all be merged, when merging one PR made the next one conflict, or when the user asks to land, merge or ship a batch of PRs.
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

In a shared list, keep both sides of each conflict: main's entries, then this PR's entries, with no line twice. Run the repo's checks, then push normally. Keep the branch history as it is, with no rebase and no force-push: a force-push rewrites history others may have pulled.

Done when the merge commit is pushed and `gh pr view <n> --json mergeable -q .mergeable` prints `MERGEABLE` (it can print `UNKNOWN` for a few seconds).

## 3. Wait for checks on the new head

Wait in the background with a deadline, not by checking by hand:

```bash
sha=$(gh pr view <n> --json headRefOid -q .headRefOid)
timeout 30m gh pr checks <n> --watch --fail-fast
gh run list --commit "$sha" --json workflowName,status,conclusion,createdAt
```

Checks count only when their runs belong to `$sha` and started after the push. A green result from before the update ran on the old main.

Done when every required check for `$sha` passed, or the report names the failing check and stops the batch.

## 4. Merge with the user's OK

Show the user the PR, `$sha` and the check results, and ask whether to merge. After a yes, merge the way the repo merges. Then go back to step 2 for the next PR.

If the user merges the PRs themselves, wait for each merge in the background before you update the next PR:

```bash
timeout 30m bash -c 'until [ "$(gh pr view <n> --json state -q .state)" = MERGED ]; do sleep 30; done'
```

Done when every PR in the batch is merged, or the report names the PR that waits for the user's OK or is blocked.
