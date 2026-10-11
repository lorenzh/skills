---
name: triaging-issues
description: GitHub issue triage against the current code. Use when the user asks to "triage the open issues" or "triage the backlog", asks which issues are still valid, already fixed, duplicates or obsolete, asks whether issues sit in the right milestone or have the right labels and priority, or wants the backlog checked before planning a release.
---

# Triaging issues

Check every open issue of a GitHub repo against the current code and report one table the user can act on.

**Every verdict cites evidence from the repo: a `file:line`, a commit SHA, a PR or an issue number. When no evidence is found, the verdict is `unclear`.** A guessed verdict that closes a valid issue loses the report it holds.

**Stay read-only until the user approves changes in step 5.** A label, milestone or state change on GitHub notifies every watcher and cannot be quietly undone.

## 1. Collect the repo state

Run in the repo's checkout, writing the lists to a temp directory so the checkout stays clean:

```bash
git fetch -q origin
main=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
git log -1 --format='%h %cs' "origin/$main"
t=$(mktemp -d)
gh issue list --state open --limit 1000 --json number,title,labels,milestone,createdAt > "$t/issues.json"
gh api --paginate 'repos/{owner}/{repo}/milestones?state=open' --jq '.[] | {title, description, due_on}' > "$t/milestones.json"
gh label list --limit 200 --json name,description > "$t/labels.json"
```

Judge the code at `origin/$main`, not the working tree: `git show "origin/$main:<path>"`, `git grep -n <pattern> "origin/$main"`.

Read an issue with `gh issue view <n> --json number,title,body,comments,labels,milestone`, never with `--comments`: that flag fails with a GraphQL error on `projectCards` on repos with Projects (classic) data.

Then write one line per open milestone: its title and the rule its description sets ("v0.6: bug fixes and polish only"), or "no description". Milestone fit is judged against these rules, not the titles.

## 2. Delegate the per-issue reading

Only rows come back to the main context. With subagents, give each a batch of about 8 issues; without, take the issues one at a time and keep only each row. The brief names the checkout path, the main SHA, the issue numbers, the `gh issue view --json` command, the milestone rules, the label names, the verdicts and columns below, and "read only, change nothing on GitHub". Each worker returns one line per issue:

```
#<n> | <verdict> | <evidence> | <milestone fit> | <type label> | <priority>: <reason> | depends on: <#m, … or none>
```

| Verdict | When | Evidence |
|---|---|---|
| still valid | the bug or gap is in the code at the main SHA | `file:line` that shows it |
| already fixed | a commit or merged PR fixed it | SHA or PR, plus the `file:line` of the fix |
| partly fixed | some of it is done | what is done and what is left |
| duplicate | another issue asks the same | `#m` |
| obsolete | the code, feature or premise is gone | the commit that removed it |
| unclear | too vague to check, or no evidence found | what is missing |

Find fixes with `git log "origin/$main" --oneline --grep '#<n>'`, `git log "origin/$main" --oneline -S'<term>'` and `gh pr list --state merged --search '<n>' --json number,title,mergeCommit`.

- **Milestone fit:** `fits`, `move to <milestone>` or `needs a milestone`.
- **Type label:** the one it has, or the missing one from the repo's labels. A label the repo lacks becomes a note.
- **Priority:** the repo's priority labels if any, otherwise high, medium or low, always with a reason ("crashes on start for every user").
- **Depends on:** issues this one needs first, from the body ("blocked by", "after #") and from the code.

## 3. Find ordering conflicts

An issue whose dependency sits in a later milestone (by `due_on`, otherwise by version order) or in none cannot ship as planned: record both issues and both milestones.

## 4. Report

The answer is exactly these parts, in order:

1. One line: repo, main SHA, number of open issues.
2. One table, one row per open issue: `# | Title | Verdict | Evidence | Milestone | Labels | Priority`. Proposed changes go in the cells: `v0.6 → v0.7`, `+bug`.
3. At most 5 notes, most important first: milestone descriptions that differ from how the user or the issues use them (the user decides whether the issues move or the description changes), ordering conflicts, labels the repo lacks, issues to close.
4. One question: which proposed changes to apply.

## 5. Apply what the user approved

Apply only the approved changes. Close an issue only when the user approved that close; "already fixed" or "apply the label changes" is not approval to close.

```bash
gh issue edit <n> --add-label <label> --remove-label <label> --milestone "<title>"
gh issue close <n> --reason completed --comment "<verdict and evidence>"   # "not planned" for duplicate or obsolete
gh issue view <n> --json labels,milestone,state
```

Done when every approved change shows in `gh issue view`, and the reply lists what was applied and what was left, including fixed issues still open because their close was not approved.
