---
name: squashing-commits
description: Interactive-rebase-free commit squashing for feature branches. Use when the user asks to squash commits, combine several commits into one, or merge fixup commits before review.
---

# Squashing Commits

Combine a branch's commits into one reviewed commit without an interactive rebase.

**Squash with a soft reset onto the merge base; never rewrite commits that are already on the base branch.**

## 1. Find the merge base

Run `git merge-base HEAD <base>` and keep the SHA.
Done when you hold the merge-base SHA.

## 2. Reset softly

Run `git reset --soft <merge-base>`. The working tree and index keep every change.
Done when `git status` shows the branch's changes staged and `git log` ends at the merge base.

## 3. Commit once

Write one commit message that summarises the branch. Commit.
Done when `git log <base>..HEAD` shows exactly one commit.

## 4. Push

If the branch was pushed before, push with `--force-with-lease`.
Done when the remote branch shows the single commit.
