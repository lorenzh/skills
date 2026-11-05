# Changesets Version PRs

Read this when the release PR is the "Version packages" PR that `changesets/action` opens and updates.

## Check for runs first, then the diff

The action usually opens the PR with the default `GITHUB_TOKEN`. Events made with that token do not start new workflow runs, so the PR usually shows no checks. Some setups still create runs that wait for approval.

Look at the PR's checks first: `gh pr checks <n>`. If runs exist or wait for approval, handle them like normal CI: approve or start them, then wait with a deadline. If no run was triggered, do not wait for CI; use the diff rule below.

Check the diff: `gh pr diff <n> --name-only`, then `gh pr diff <n>`. The diff may contain only:

- removed `.changeset/*.md` files,
- `CHANGELOG.md` entries,
- `version` fields in package manifests (and internal dependency ranges the action raised),
- the lockfile's version lines for the workspace packages.

Check the bump level too. Under 0.x, a breaking change takes a `minor` changeset; a `major` changeset bumps to 1.0.0. If the PR releases a breaking change as a patch, or reaches 1.0.0 without a plan for it, stop and fix the changeset.

If anything else is in the diff, stop and send the PR through normal review. The checks of the feature PRs on the base branch covered the code; this diff covers only the version change.

Done when the diff holds only those changes, or the PR went to normal review.

## Wait for a just-merged changeset

If a feature PR with its own changeset merged shortly before, the action is still regenerating the Version PR. Merging now releases without that change, and it lands in the next release.

Wait until the run of the release workflow for the latest base commit has finished. Then confirm the Version PR lists that changeset: its `.changeset/<file>.md` is among the removed files, and its entry is in the CHANGELOG. Cap the wait at 10 minutes (tunable); on timeout, report and ask.

Done when the Version PR contains every changeset merged before the merge decision.

## After the merge

The merge triggers the publish run. Then check both:

- the tag exists: `git ls-remote --tags origin '<pkg>@<version>'` (or `v<version>`);
- the registry's `latest` dist-tag shows the version: `npm view <pkg> dist-tags`. Snapshot or prerelease versions stay under `next` (or the tag the project uses); `latest` must not point at one.

Done when the tag exists and `latest` is the new version.
