# Changesets Version PRs

Read this when the release PR is the "Version packages" PR that `changesets/action` opens and updates.

## Do not wait for checks

The action opens the PR with the default `GITHUB_TOKEN`. Events made with that token start no workflows, so the PR shows no checks, and none will appear. Do not wait for CI on it.

Check the diff instead: `gh pr diff <n> --name-only`, then `gh pr diff <n>`. The diff may contain only:

- removed `.changeset/*.md` files,
- `CHANGELOG.md` entries,
- `version` fields in package manifests (and internal dependency ranges the action raised),
- the lockfile's version lines for the workspace packages.

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
