---
name: cutting-releases
description: Release workflow from version bump to verified install. Use when the user asks to "cut a release", "release x.y.z", "ship a new version" or publish to npm or another registry, or when a release was tagged but the package, the back-merge to main or the installed version still needs checking.
---

# Cutting releases

Take a release from version bump to a published, installed and verified version, with the release branch merged back into main.

**A release is done when the back-merge is merged and the installed version is verified, not when the tag is pushed.**

## 0. Read the project's release document

Look for `RELEASING.md`, a release section in `CONTRIBUTING.md`, or release scripts in the repo. Where it exists, its commands, branch names and order win over the steps below; use these steps for what it leaves out. Copy the step list below into your task list or notes, with the project's commands filled in, so a long run does not lose its place.

Done when you have a written list of the release steps for this repo, with the commands to run.

## 1. Bump the version

Run the project's version script (or edit the versions it names), on a branch from the release branch. Check that every manifest shows the new version: `git grep -n '"version"'` or the project's equivalent.

Done when every versioned file shows the new version on the branch.

## 2. Open and merge the release PR

Open the PR into the release branch the document names (`release/x.y`, `main`, ...). Wait for checks with `gh pr checks <n> --watch --fail-fast`, then merge.

Done when the release PR is merged.

## 3. Tag and watch the release workflow

Create the tag the way the document says (by hand, or a workflow does it on merge). Find the release workflow run and watch it:

```bash
gh run list --workflow <release-workflow> --limit 1 --json databaseId,status
gh run watch <run-id> --exit-status
```

If a job fails with a timeout or a network error, rerun it once with `gh run rerun <run-id> --failed`. A second failure, or any other error, is real: stop and report the failing step and its log.

Done when the release run has passed.

## 4. Wait for the registry

The package can lag behind the workflow. Poll with a limit:

```bash
for i in $(seq 1 30); do
  [ "$(npm view <pkg>@<dist-tag> version 2>/dev/null)" = "<version>" ] && echo ready && break
  sleep 20
done
```

Use the registry's own query for other ecosystems (`pip index versions`, `cargo search`). 10 minutes is a tunable default; after a timeout, report the last version seen.

Done when the loop printed `ready`, or the timeout is reported.

## 5. Merge the release branch back into main

If the release branch is not `main`, open a PR from the release branch into `main` and merge it after its checks pass. A missed back-merge leaves `main` on the old version, and the next release starts from the wrong number.

Done when the back-merge PR is merged, or the report states that the release branch is `main`.

## 6. Update and verify the installed version

Update the installed copy the way users do (`npm i -g <pkg>@<version>`, `claude plugin update <plugin>`, ...) and check it:

```bash
<cli> --version
```

A running agent session can keep the old plugin's `bin` directory on `PATH`. If `--version` still shows the old version after the update, reload the plugins (Claude Code: `/reload-plugins`) or start a new session, then check again.

Done when `--version` prints the new version.

## 7. Report

```
Release: <version>  tag: <tag>  workflow: <run url> passed
Registry: <pkg>@<dist-tag> = <version>
Back-merge: <PR url> merged | release branch is main
Installed: <cli> --version -> <version>
```

Done when every line is filled.
