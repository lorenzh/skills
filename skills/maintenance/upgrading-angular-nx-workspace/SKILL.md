---
name: upgrading-angular-nx-workspace
description: >
  Upgrades an Angular and Nx monorepo to a chosen major version, or updates its packages to the latest compatible versions. Use when the user asks to "update Angular and Nx to latest", "upgrade to Angular N", "bring the workspace up to date", or starts a major dependency upgrade in an Nx monorepo. Covers the update order, one commit per package group, migrations, baseline comparison, deferred majors and CI triage.
---

# Upgrading Angular Nx Workspace

Move an Angular and Nx workspace to new versions in small commits, and show that the upgrade adds no new failures.

**Compare every check with a baseline taken on the target branch before the first upgrade edit. Count only new failures.**

Global rules:

- "Latest compatible" means the latest patch within the major version the user chose. Ask if the major is unclear.
- Run Nx and package commands through the workspace package manager, for example `npx nx`.
- Disable the Nx daemon (`NX_DAEMON=false`) for every run. In a worktree, give Nx a cache directory private to that worktree.
- Use the Node version that the new `engines` range requires. Check it before the first install.
- Never regenerate API clients against a live host without explicit authority. Patch the generator's post-processing and test that instead.
- If a check cannot run in the current sandbox, report it as "not run". Exit 0 without a test summary is not evidence.

## 1. Read the project rules and pinned versions

Before any edit, read the project's docs and constitution, if they exist. Grep `package.json`, the lockfile and `nx.json` for pinned versions and version-specific config.
If a rule forbids a change, stop and ask the user before that change.
Done when a list of pins and rules exists in a scratch file outside the repo.

## 2. Capture the baseline on the target branch

Before the first upgrade edit, run typecheck, lint, test and build on the unchanged target branch.
Save each result with its list of failing items.
Done when each of the four checks has a saved result with its failures listed.

## 3. Upgrade in group order, one commit per group

Update in this order: Nx and its plugins first, then Angular and TypeScript, then the other packages in ecosystem groups such as testing, lint, styling and state.
For each group, read the package's migration guide. Run its migrations with the tool the package provides, such as `nx migrate` or `ng update`. Apply the fixes that the migration reports.
Allow at most 3 attempts per group. Then stop and report the failing group.
Done when each group has one commit with the version diff, the migration output and any code fixes.

## 4. Record deferred majors

If a major upgrade needs its own project, do not force it. Examples are a test runner, a CSS framework or a validation library.
Keep the current version in the lockfile and add a follow-up entry with the reason and the target version.
Done when every deferred package has a follow-up entry with its reason.

## 5. Compare the upgraded branch with the baseline

On the upgraded branch, run the same four checks from step 2. Typecheck is mandatory, because test and lint do not catch type errors.
Compare each failure list with the baseline. A failure counts as new only when it is absent from the baseline.
Run a browser smoke test of the main flows and check the console for errors.
If a group adds a new failure, fix it. Allow at most 2 fix rounds per group. Then revert that group and report it.
Done when each check states its count of new failures, and the smoke test is recorded or marked "not run".

## 6. Verify with a reviewer from another model family

Use a verifier from a different model family than the one that made the upgrade, when one is available. The verifier runs the checks itself or marks them "not run".
If no other family is available, say so in the PR description.
Done when the verifier's findings and its model name are recorded.

## 7. Deliver a reviewable history

Create a new branch from the target branch. Apply the kept group commits in order. Skip upgrades that were tried and reverted.
Keep the old branch as a backup. Check that both branches end with the same tree: `git diff --quiet <old> <new>`.
Put version facts from the docs in their own commit.
Do not push or open a pull request without the user's approval. If the PR conflicts with its target, merge the target into the branch. Never force-push a shared branch.
Done when the tree check exits 0 and the user has approved the push.

## Triage a failed PR build

Use these steps when the PR build fails on one test.

1. Find the line `Failed tasks:` near the end of the CI log. Read the failing tasks from there.
   Done when the failing task and test names are written down.
2. Diff the failing test file against the target branch.
   Done when the diff shows whether the upgrade changed the test.
3. Run the failing test locally with the CI configuration.
   Done when the local result is recorded as pass, fail or "not run".
4. If the test fails on a timing wait, fix the wait: use a larger timeout or wait for a visible state. Never re-run the job to get a green result.
   Done when the fix is committed on the PR branch.

## Example

Input: "update Angular and Nx to the latest 22.x".
Action: the baseline on the target branch shows 3 typecheck errors that already exist. The upgrade runs as four commits: Nx, Angular and TypeScript, testing, then styling. One package has a new major and is deferred.
Result: the comparison shows no new failures. The follow-up list names the deferred package and its reason.
