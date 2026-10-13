---
name: reproducing-bugs
description: Live reproduction of reported bugs in terminal apps (TUI, CLI, REPL, coding-agent mod) on a clean checkout of the default branch, with the finding recorded in the issue. Use when the user asks to "reproduce the bugs", "check whether this bug really happens", "verify the open bug issues in a real run", or wants triaged bug issues confirmed before a fix or a release.
---

# Reproducing bugs

Run a reported bug of a terminal app on a clean checkout of the default branch, through the real screen, and record reproduced, not reproduced or not run in the issue.

**Only text the app drew counts as evidence, and one failed run never closes or downgrades an issue.** A run that matches a transcript quote, or that lost keys, reports a bug that is not there or hides one that is.

Builds on [triaging-issues](../triaging-issues/SKILL.md) for verdicts and on `driving-terminal-apps` for every start, key, wait, capture and stop; its `references/screen-checks.md` and, for Claude Code mods, `references/claude-code.md` apply in full. This skill does not repeat them.

A run finds what code reading cannot: a unit test kit can be green while focus landing, key timing or layout under the renderer is broken (a pinned list drew only every second row; only a live run showed it).

## 1. Pick candidates

Read each open issue with `gh issue view <n> --json number,title,body,comments,labels`. Take issues typed `bug` or with steps, whose triage verdict is `still valid` or `unclear`; run the triaging-issues steps first when no verdict exists. Order by priority and take at most about 10 per run.

Skip with a reason, recorded as `not run`:

| Reason | When |
|---|---|
| not a bug | feature request, question, docs wish |
| no terminal app | web page, library API, service with no screen |
| needs what the stage lacks | credentials, accounts, customer data, hardware |
| steps too vague | no action that can become keys, even after the comments |

Done when every issue has a candidate or a skip row with its reason.

## 2. Stage a clean checkout

Check the default branch out as a detached worktree at its current SHA, outside the working tree, and install dependencies there (see `creating-worktrees` for placement and installs):

```bash
git fetch -q origin
main=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
sha=$(git rev-parse --short "origin/$main")
git worktree add --detach .worktrees/repro-$sha "origin/$main"
```

The working tree holds unmerged edits, so a bug seen or missed there says nothing about the default branch. Make an empty throwaway folder for the run, and start the app from it by absolute path. Take the terminal size from the issue; use 120x35 when it names none. Keep tokens, home paths with user names, work repositories and customer data off screen.

Done when the worktree sits at the default branch SHA, dependencies are installed, and the run folder is empty.

## 3. Reproduce one issue

Use the `driving-terminal-apps` process with its own tmux socket per issue, named after the issue (`repro-<n>`).

1. Turn the issue's steps into keys. After each action `wait` on text the app draws for that action; keep at least 0.2 s between redrawing keys. A key that was dropped looks like "bug not present", so a missing wait result is an inconclusive run, not a pass.
2. Capture the start screen and the screen at the failing step with `cap`.
3. Judge by the rules in `screen-checks.md`: check inside the app's own frame, and treat a label that only a transcript quotes as not drawn.
4. Stop the server with `stop`, then check with a bracketed `pgrep` that no process of this run is left.

Use the user's real login only where the app under test requires it and the project's own live-check rules allow it. Never copy credentials and never print the environment.

Done when the capture files exist, `stop` exited 0 and no process of the run is left.

## 4. Climb the model ladder

Run the first attempt with the cheap model the app's test rules name. When the result is inconclusive, escalate one model step and run again. Before reporting `not reproduced`, confirm with the next model or with a second run at the size or timing the issue names (slow typing, narrow terminal, big list).

A failed reproduction never closes an issue and never overrides a code reading that still shows the bug: it stays `still valid`, with the note that one live run did not show it.

Done when each issue has `reproduced`, `not reproduced` after a confirming run, or `not run` with a reason.

## 5. Write the result per issue

One row per issue: `# | result | steps | seen | expected | capture path | effect on verdict`. Reproduced moves `unclear` to `still valid`; not reproduced and not run leave the verdict as it was.

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

Done when each comment has the first line, numbered steps, one sentence for expected and observed, and a capture of at most 25 lines or the tried-and-needed list.

## 7. Check, then post

Read every capture line by line. Remove home paths with user names, tokens, hostnames, account names and customer data, then recapture on a clean stage rather than hand-edit. Run the `checking-before-publishing` skill on every comment; an unread capture is never posted.

Post with `gh issue comment <n> --body-file <file>` only when the user approved it, or when the calling workflow's rules allow comments. Otherwise return the comment files and ask.

Finally remove the worktree: `git worktree remove .worktrees/repro-$sha`.

Done when each posted comment shows in `gh issue view <n> --json comments` and the reply lists posted, held-for-approval and not-run issues.
