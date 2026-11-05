---
name: extracting-repos-from-monorepo
description: Monorepo split workflow that moves packages into their own repository with history and switches the monorepo to the published versions. Use when the user asks to move a package or folder of a monorepo into its own repository, to keep its git history while extracting it, or to split a monorepo into several repositories.
---

# Extracting Repos From Monorepo

Move a package set into a new repository with its history, publish it, and make the monorepo consume it from the registry.

**Extract only what changes apart from its consumers, and make the extraction a script you can rerun.**

## Settings

| Setting | Controls | Allowed values | Default |
|---|---|---|---|
| registry | Registry the new repo publishes to | Registry host or URL | https://registry.npmjs.org |
| workspace-tool | Tool that owns the monorepo workspace and its version catalog | `npm`, `pnpm`, `yarn`, `bun` | the tool the repo's lockfile names |
| packages | Packages to extract | Comma-separated package names or paths | decided in step 1 |

Never merge, publish a stable version, or change registry permissions without the user's OK for that action.

## 1. Decide the package set
Read `extracting-repos-from-monorepo.<setting>: <value>` lines from instruction files in context, such as AGENTS.md or CLAUDE.md; strip one pair of backticks.
Precedence: invocation > project file > user file > default. Print `settings: <name>=<value> (<source>)` per setting.
Count how often each candidate changes together with its consumers, for example `git log -n 300 --name-only --format=%H`.
If about half of a package's commits also touch a consumer, keep it with that consumer.
A package whose only consumer stays behind stays behind too; splitting one away once broke about 700 tests.
Done when a table lists each package, its consumers, the shared-commit ratio, and extract or keep.

## 2. Write a rerunnable extraction script
Keep the script and its patches outside both repositories. It runs from scratch every time:

```sh
git clone --no-tags <monorepo-url> work && cd work
git checkout -B main <ref>                 # then delete every other branch and remote ref
git filter-repo --path packages/core/ --path packages/plugin/ --path LICENSE
git filter-repo --message-callback 'return re.sub(rb"(?<![\w/])#(\d+)", rb"acme/monorepo#\1", message)'   # your old repo
GIT_COMMITTER_NAME=<fixed> GIT_COMMITTER_EMAIL=<fixed> \
  git am --3way --committer-date-is-author-date ../patches/*.patch   # root package.json, CI, README
```

List every kept path with an explicit `--path`; never rely on a glob that grows.
Put the new root setup (workspace file, CI, lockfile) in the patch series, not in hand edits.
Run the script twice and compare `git rev-parse HEAD`; if the hashes differ, fix the nondeterminism first.
Expect to rerun it: a real split ran three times (feature branch, main, after moving one package back).
Done when two runs give the same HEAD and old `#N` references read `<old-repo>#N`.

## 3. Prepare the registry before the first release
Give the publishing repository Write access to each package and every consumer repository Read access.
On GitHub Packages, set this under each package's "Manage Actions access"; a missing entry gives HTTP 403 on install.
Give every CI install step `NODE_AUTH_TOKEN` and the job `packages: read`, not only the publish job.
Publish the first version under the `next` dist-tag, then install it from a consumer CI run.
Done when a consumer CI install of the `next` version passes.

## 4. Switch the monorepo to the registry
Point every consumer at the published version through one place, such as the workspace catalog.
Delete the extracted copies and all their wiring: tsconfig `paths` and `references`, publish lists, API or package inventories.
Do not rewrite tests that reach into internals of extracted packages. Move them to the new repository, or list each with a decision.
Done when `git grep` finds no path or name of an extracted package outside the catalog and the lockfile.

## 5. Verify from a clean tree
Delete every `dist/` and build cache, install, then run the typecheck; a stale local build once hid a missing `paths` entry.
Pack each publishable package and read its `package.json` from the tarball.
If a dependency range reads `workspace:` or `catalog:`, fix the publish step before release.
Done when the clean typecheck and tests pass and every packed manifest shows real version ranges.

## Example
Input: "Move `@acme/core` out of `acme/monorepo` into `acme/core` with history."
Action: step 1 shows `@acme/plugin` shares 55% of its commits with `@acme/core`, so both move. The script reruns to the same HEAD. The `next` publish passes a consumer install. The monorepo catalog pins `^1.0.0-next.1`.
Result: `acme/core` holds both packages' history; the monorepo typechecks with no `dist/` present.
