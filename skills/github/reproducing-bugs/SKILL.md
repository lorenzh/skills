---
name: reproducing-bugs
description: Live reproduction of reported bugs in terminal apps (TUI, CLI, REPL, coding-agent mod). Use when the user asks to "reproduce the bugs", "check whether this bug really happens", "verify the open bug issues in a real run", or wants triaged bug issues confirmed before a fix or a release.
---

# Reproducing bugs

Run a reported bug of a terminal app on a clean checkout of the default branch, through the real screen, and record reproduced, not reproduced, inconclusive or not run in the issue.

**Only text the app drew counts as evidence, and one failed run never closes or downgrades an issue.** A run that matches a transcript quote, or that lost keys, reports a bug that is not there or hides one that is.

Use available skills or tools for issue triage, terminal automation and worktree isolation. Otherwise do those tasks with `git`, `gh` and `tmux` as described below. Before any terminal run, read [references/terminal-checks.md](references/terminal-checks.md); its safety, screen-check and Claude Code requirements always apply. If a required capability remains unavailable, name the unowned part and ask how to proceed.

## 1. Pick candidates

Read each open issue with `gh issue view <n> --json number,title,body,comments,labels`. Take issues typed `bug` or with steps, whose triage verdict is `still valid` or `unclear`; triage against the default-branch code first when no verdict exists. Cite a `file:line`, SHA, PR or issue for every verdict; without evidence use `unclear`. Order by priority and take at most 10 per run (tunable default).

Skip with a reason, recorded as `not run`:

| Reason | When |
|---|---|
| not a bug | feature request, question, docs wish |
| no terminal app | web page, library API, service with no screen |
| needs what the stage lacks | credentials, accounts, customer data, hardware |
| steps too vague | no action that can become keys, even after the comments |

Done when every issue has a candidate or a skip row with its reason.

## 2. Stage a clean checkout

Check the default branch out as a detached worktree at its current SHA, outside the working tree, and install dependencies there. Check that `.worktrees/` is ignored first; use the project's prescribed placement and setup when present:

```bash
git fetch -q origin
main=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
sha=$(git rev-parse --short "origin/$main")
git worktree add --detach .worktrees/repro-$sha "origin/$main"
```

The working tree holds unmerged edits, so a bug seen or missed there says nothing about the default branch. Make an empty throwaway folder for the run, and start the app from it by absolute path. Take the terminal size from the issue; use 120x35 when it names none. Keep tokens, home paths with user names, work repositories and customer data off screen.

Done when the worktree sits at the default branch SHA, dependencies are installed, and the run folder is empty.

## 3. Reproduce one issue

Use a fresh tmux socket per issue, named `repro-<n>`. Follow the terminal-check reference for startup, keys, captures and cleanup.

1. Turn the issue's steps into keys and drive one action followed by a wait for its visible effect, with at least 0.2 s between redrawing keys. A dropped key looks like "bug not present", so a `wait` that never matched makes the run `inconclusive`, not a pass.
2. Capture the start screen and the screen at the failing step with `cap`. For a highlight, focus or colour bug capture with `cap -e` (keeps ANSI attributes) and check the attribute on the expected row, not just the drawn text.
3. Judge a framed app only inside its frame using the terminal-check reference. For plain CLI or REPL output, first run a unique marker in the app's own syntax (`type` it, then `key Enter`: `echo repro-<n>-start` in a shell, `print("repro-<n>-start")` in Python) and judge only the output after it; there no frame is expected, so "no frame found" is not a setup error.
4. Stop only the session you created. Check that its app and child processes are gone; stop only leftovers belonging to this run.

Use the user's real login only where the app under test requires it and the project's own live-check rules allow it. Never copy credentials and never print the environment.

Done when capture files exist, the owned session has stopped successfully, and no app processes from this run remain.

## 4. Confirm before not reproduced

Before reporting `not reproduced`, confirm it. If the app calls a model, start with the cheap model its test rules name and escalate one step; otherwise confirm with a second run at the size or timing the issue names (slow typing, narrow terminal, big list).

Rerun an inconclusive run. After 2 inconclusive runs (tunable default) the issue gets `inconclusive` with the reason (for example, the wait for `<text>` never matched); the verdict stays unchanged.

A failed reproduction never closes an issue and never overrides a code reading that still shows the bug: it stays `still valid`, with the note that one live run did not show it.

Done when each issue has `reproduced`, `not reproduced` after a confirming run, `inconclusive` with its reason, or `not run` with a reason.

## 5. Write the result per issue

One row per issue: `# | result | steps | seen | expected | capture path | effect on verdict`. Reproduced moves `unclear` to `still valid`; not reproduced, inconclusive and not run leave the verdict as it was.

Done when every candidate has a row and every row names a capture file or the skip reason.

## 6. Write the finding comment

```text
Reproduced on <branch> <sha> (<app> <version>, <cols>x<rows>)

1. <step as keys or commands>
2. <step>

Expected: <one sentence>
Observed: <one sentence>

<capture, at most 25 lines, in a code block>
```

`Not reproduced on …` has the same first line and steps, then what was tried (models, sizes, timing) and what would help: an exact version, a terminal size, a file the app opens, a recording.

`Inconclusive on …` has the same first line and steps, then the reason (for example, the wait for `<text>` never matched in 2 runs) and what would help.

Done when each comment has the first line, numbered steps, one sentence for expected and observed, and a capture of at most 25 lines, the tried-and-needed list, or the inconclusive reason.

## 7. Check, then post

Read every capture line by line. Remove home paths with user names, tokens, hostnames, account names and customer data, then recapture on a clean stage rather than hand-edit. Run a privacy/secret check of every final comment and capture, with a skill or tool if available. Otherwise read every line by hand for the values above, emails, session IDs, internal URLs and IPs, and private repository names. Recheck after the last edit; an unread capture is never posted.

Post with `gh issue comment <n> --body-file <file>` only when the user approved it, or when the calling workflow's rules allow comments. Otherwise return the comment files and ask.

Finally remove the worktree by its literal path, with the SHA from step 2 (the shell that set `sha` may be gone): `git worktree remove .worktrees/repro-<sha>`.

Done when each posted comment shows in `gh issue view <n> --json comments` the reply lists posted, held-for-approval and not-run issues, and `git worktree list` no longer shows repro-<sha>.
