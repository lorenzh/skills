---
name: creating-worktrees
description: Git worktree setup and cleanup for isolated parallel work. Use when the user asks to "work in a worktree", wants an isolated workspace or a parallel branch checkout, is about to execute an implementation plan that should not touch the current checkout, asks how to install dependencies or copy .env files into a worktree, wants a coding agent or sandbox to work in one, or asks to remove or clean up a worktree.
---

# Creating Worktrees

Give a task its own checkout that builds and tests on its own, then remove it without touching the main checkout.

**A worktree is isolated only when its files, its dependencies and its config all resolve inside it. Check that; do not assume it.**

Path names below: `<root>` is the main checkout, `<wt>` the worktree, `<skill>` this skill's folder.

## 1. Detect existing isolation

Run in the current directory:

```bash
git rev-parse --path-format=absolute --git-dir --git-common-dir
git rev-parse --show-superproject-working-tree
git branch --show-current
```

- The two paths differ and the superproject line is empty: you are already in a linked worktree. Use it and go to step 4. A second worktree duplicates the isolation the user already has and branches from the wrong base.
- The paths differ and the superproject line prints a path: you are in a submodule. Treat it as a normal checkout.
- The paths are equal: a normal checkout. Go on.

An existing worktree on a detached HEAD is managed by the harness; note that it needs a branch before anything is pushed.

Done when the report's `Isolation` line says "existing worktree <path>" or "normal checkout".

## 2. Create the worktree

**Native tool first.** If the harness offers a worktree tool or flag (Claude Code: the `EnterWorktree` tool or `claude --worktree <name>`; elsewhere a `/worktree` command or `--worktree` flag), use it. It manages placement, branch and cleanup; a `git worktree add` beside it creates state the harness cannot see. Claude Code places its worktrees under `<root>/.claude/worktrees/<name>` and copies the files listed in `.worktreeinclude`. Then continue with step 3 for what the tool does not do.

**Otherwise `git worktree add`.** Location, first match wins:

1. A location the user or the project's instruction files (`AGENTS.md`, `CLAUDE.md`) name.
2. An existing `<root>/.worktrees/`.
3. Default: `<root>/.worktrees/<name>`.

In-repo placement suits sandboxes: git writes the worktree's `HEAD`, index and refs to `<root>/.git/worktrees/<name>`, so a sandbox rooted at `<root>` covers both. A worktree outside `<root>` needs that `.git` granted separately (Codex: `--add-dir <root>/.git`; containers: a mount), or `git commit` fails there.

Before the first `git worktree add`, check the ignore entry:

```bash
git -C <root> check-ignore -q .worktrees/x && echo ignored
```

Not ignored: add `.worktrees/` to `.gitignore` and report the change as uncommitted. Commit it only when the user asks; a commit lands on whatever branch `<root>` has checked out. Without the entry, `git status` shows `?? .worktrees/` and `git add -A` stages every worktree.

```bash
git -C <root> worktree add .worktrees/<name> -b <branch>   # new branch
git -C <root> worktree add .worktrees/<name> <branch>      # existing branch
```

**Sandbox denial.** If creation fails with a permission or sandbox error, say so in one line ("The sandbox blocked worktree creation; working in the current checkout.") and work in place. If the user made isolation a condition ("main must stay untouched"), stop after that line and wait instead. Changing sandbox settings, picking another path to get around the denial, or running outside the sandbox is the user's decision.

Done when `git worktree list` shows `<wt>` on the intended branch and `.worktrees/` is ignored, or the report records the sandbox denial.

## 3. Keep tools out of the worktree directory

The worktree directory is the parent of `<wt>` inside `<root>`: `.worktrees/`, or `.claude/worktrees/` for Claude Code's native tool. Run this step for an existing in-repo worktree from step 1 too. Git, `rg`, `fd`, `tsc`, pytest and Bun's test runner skip a dot directory or follow `.gitignore`. These scan it unless told:

| Tool | Exclude |
|---|---|
| Docker build context | `.worktrees/` in `.dockerignore` (Docker does not read `.gitignore`) |
| ESLint 9 flat config | `ignores: ["**/.worktrees/**"]`, or `includeIgnoreFile` for `.gitignore` |
| Jest | `testPathIgnorePatterns: ["/\\.worktrees/"]` (regular expressions) |
| Vitest | `exclude: [...configDefaults.exclude, "**/.worktrees/**"]` (globs) |
| Biome | `vcs.useIgnoreFile: true` |
| IDE file watchers | `files.watcherExclude` (VS Code), "Excluded" folder (JetBrains) |

Use the actual directory name in each entry. Add an entry only for a tool whose config file exists in `<root>`, and report each added line as uncommitted.

Done when every tool in the table with a config file in `<root>` excludes the worktree directory, or the report lists it as not added.

## 4. Provide dependencies

A worktree has tracked files only. Node and Bun resolve a missing `node_modules` by walking up the tree, so `<wt>` without an install silently loads `<root>/node_modules`, installed for another lockfile. Config lookups walk up the same way (tsconfig `extends`, ESLint, Prettier, `.npmrc`, the Cargo workspace root, an activated venv on `PATH`).

Run the check:

```bash
node <skill>/scripts/wt-deps.mjs check <wt>
```

It names each ecosystem by its lockfile, compares the lockfile hash with `<root>`'s, reads the marker of the last install, and prints one action per ecosystem. Exit 1 means an install is due.

| Action | Do |
|---|---|
| `install` | Run the printed command in `<wt>`, also when the lockfile equals main's: npm, pnpm, Bun, Yarn and uv install from their global cache, so it is cheap. |
| `reinstall` | The lockfile changed since the last install, or no marker exists. Run the printed command. |
| `ok` | Nothing to do. |
| `cache` | Go, Cargo, NuGet, Gradle, Maven: one global cache serves every worktree; the build fetches what it needs. |

A symlink to `<root>`'s dependency directory is the last resort, made only when the user asks for it after hearing the cost: Node resolves the real path, so packages load relative to `<root>`; bundlers and test runners treat symlinks differently; postinstall output (native builds, generated clients) belongs to `<root>`; and a delete through the link (`rm -rf node_modules/`, trailing slash) wipes `<root>`'s install. A request to "not reinstall" is answered with the cache install above, which takes seconds.

An install needs network access and write access to the package manager's global cache (for example `~/.npm`, `~/.bun/install/cache`, `~/.local/share/pnpm`, `~/.cache/uv`), which lies outside the repo. If the sandbox denies either, report it as in step 2.

After the install, record it and check resolution:

```bash
node <skill>/scripts/wt-deps.mjs mark <wt>
node <skill>/scripts/wt-deps.mjs resolve <wt>
```

`mark` writes the lockfile hashes to `<wt>`'s git dir, outside the work tree, so a later `check` reports a lockfile change as `reinstall`. `resolve` exits 1 for every `package.json` dependency whose real path does not start with `<wt>` and names where it resolved. In a nested project, pass its directory (`<wt>/packages/app`) to all three commands. For Python, check by hand through the project's runner (`uv run`, `poetry run`, `pipenv run`): `<runner> python -c "import sys; print(sys.prefix)"` in `<wt>` prints a different prefix than in `<root>` (uv: one starting with `<wt>`).

Done when `check` and `resolve` both exit 0, or the report names the symlink the user asked for.

## 5. Copy local files only with consent

Untracked local files (`.env*`, `.claude/settings.local.json`, local certificates) are not in `<wt>`. List the candidates:

```bash
git -C <root> ls-files --others --ignored --exclude-standard --directory | grep -v -e node_modules -e '^\.worktrees/'
git -C <root> ls-files --others --exclude-standard | grep -i -e '\.env' -e secret -e '\.pem$'
```

Show the list and ask which to copy. A file holding secrets (tokens, passwords, keys, connection strings) is copied only after the user names it; copied silently, the secrets sit in a second place that later commands, agents and commits reach. Copy an approved file with `cp -p -n`, then run `git -C <wt> check-ignore -q <file>`; if it is not ignored, say so before anyone runs `git add -A`. A `.worktreeinclude` file the user maintains counts as the approved list.

If the user cannot be asked, copy nothing that holds secrets, and name each missing file and the test it breaks in the report.

Done when the report's `Local files` line lists each candidate as copied (approved) or not copied.

## 6. Verify a clean baseline

Run the project's test command in `<wt>`. If tests fail, report the failures and ask whether to go on; without a clean baseline, later failures cannot be told apart from existing ones.

Done when the test command's result is in the report.

## 7. Report

```
Isolation: <existing worktree <path> | new worktree <path> on <branch> | in place: <reason>>
Ignore entries: <lines added, uncommitted | none needed>
Dependencies: <ecosystem: action taken; resolve: inside | symlink by request>
Local files: <file: copied (approved) | not copied: reason>
Baseline: <command> -> <N passed, M failed>
Sandbox: <none | what was denied>
```

Done when this block is printed with every line filled.

## Cleanup

When the user is done with a worktree:

1. Run `git -C <wt> status --short` and `git log <branch> --not --remotes --oneline`, and report uncommitted files and unpushed commits before deleting anything.
2. Remove symlinks first with `rm <wt>/<link>` (no `-r`, no trailing slash).
3. `git worktree remove <wt>`. It refuses a worktree with untracked or changed files; `--force` deletes them, so use it only after the user, shown the list from step 1, says to discard them. Otherwise keep the worktree. A locked worktree needs `git worktree unlock <wt>` first.
4. `git worktree prune` drops entries whose directory is already gone, for example after an `rm -rf <wt>`.
5. Delete the branch with `git branch -d` only if `git branch --merged` lists it.

`git clean -xdff` (double `f`) in `<root>` deletes in-repo worktrees with their uncommitted work; `git clean -xdf` skips them.

After `<root>` or `<wt>` moves, or in a container that mounts the repo at another path, the worktree's `.git` file points at a stale absolute path: run `git worktree repair` in the moved checkout. Git 2.48 and later can store relative links instead (`git worktree add --relative-paths`, or `git config worktree.useRelativePaths true`); older git versions cannot read the repository afterwards.

## Common mistakes

| Mistake | Result | Fix |
|---|---|---|
| New worktree from inside a worktree | Duplicate isolation, wrong base branch | Step 1 |
| `git worktree add` beside a native tool | State the harness cannot see or clean up | Step 2 |
| Committing the `.gitignore` entry unasked | An unrequested commit on the user's branch | Report it uncommitted |
| No install in `<wt>` | Tests load `<root>`'s dependencies | Step 4, `resolve` |
| Symlinked `node_modules` to save time | Wrong resolution; a delete can wipe `<root>`'s install | Cache install |
| Copying `.env` to make tests pass | Secrets spread without consent | Step 5 |
| Working around a sandbox denial | Bypasses the user's security boundary | Report, work in place |
| `rm -rf <wt>` | Stale entry in `.git/worktrees/` | `git worktree remove` |
