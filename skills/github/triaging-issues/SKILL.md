---
name: triaging-issues
description: GitHub issue triage against the current code. Use when the user asks to "triage the open issues" or "triage the backlog", asks which issues are still valid, already fixed, duplicates or obsolete, asks whether issues sit in the right milestone or have the right labels and priority, or wants the backlog checked before planning a release.
---

# Triaging issues

Check every open issue of a GitHub repo against the current code and report one table the user can act on.

**Every verdict cites evidence from the repo: a `file:line`, a commit SHA, a PR or an issue number. When no evidence is found, the verdict is `unclear`.** A guessed verdict that closes a valid issue loses the report it holds.

**Stay read-only until the user approves changes in step 6.** A label, milestone or state change on GitHub notifies every watcher at once and cannot be quietly undone.

## 1. Collect the repo state

Run in the repo's checkout:

```bash
git fetch -q origin
main=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
git log -1 --format='%h %cs' "origin/$main"
gh issue list --state open --limit 1000 --json number,title,labels,milestone,createdAt > issues.json
gh api --paginate 'repos/{owner}/{repo}/milestones?state=open' --jq '.[] | {title, description, due_on}' > milestones.json
gh label list --limit 200 --json name,description > labels.json
```

Judge the code at `origin/$main`, not the working tree, which may be another branch or behind: read with `git show "origin/$main:<path>"` and `git grep -n <pattern> "origin/$main"`.

Read an issue's body and comments with `--json`, never with `--comments`:

```bash
gh issue view <n> --json number,title,body,comments,labels,milestone
```

`gh issue view --comments` fails with a GraphQL error on `projectCards` on repos that still have Projects (classic) data; `--json` asks only for the named fields.

Done when `issues.json`, `milestones.json` and `labels.json` exist and you have the main SHA.

## 2. Write down what each milestone admits

For each open milestone, write one line: its title and the rule its description sets ("v0.6: bug fixes and polish only"). A milestone without a description gets "no description".

Judge milestone fit against these written rules. When the user's own words or the issues a milestone holds contradict its description, keep that as a note for step 5: the user decides whether the issues move or the description changes.

Done when every open milestone has its one-line rule.

## 3. Delegate the per-issue reading

Keep issue bodies, comments and code reads out of the main context; only rows come back. If the harness can start subagents, give each one a batch of about 8 issues (tunable). Without subagents, take the issues one at a time and keep only each row.

The brief names: the checkout path, the main SHA, the issue numbers, the `gh issue view --json` command from step 1, the milestone rules from step 2, the label names from `labels.json`, the verdicts and columns below, and "read only, change nothing on GitHub". Each worker returns one line per issue and nothing else:

```
#<n> | <verdict> | <evidence> | <milestone fit> | <type label> | <priority>: <reason> | depends on: <#m, … or none>
```

| Verdict | When | Evidence |
|---|---|---|
| still valid | the bug or gap is in the code at the main SHA | `file:line` that shows it |
| already fixed | a commit or merged PR fixed it | SHA or PR, plus the `file:line` that shows the fix |
| partly fixed | some of it is done | what is done (SHA or `file:line`) and what is left |
| duplicate | another issue asks the same | `#m` |
| obsolete | the code, feature or premise is gone | the commit that removed it |
| unclear | the issue is too vague to check, or no evidence was found | what is missing |

Find fixes with `git log "origin/$main" --oneline --grep '#<n>'`, `git log "origin/$main" --oneline -S'<term>'` and `gh pr list --state merged --search '<n>' --json number,title,mergeCommit`.

- **Milestone fit:** `fits`, `move to <milestone>` or `needs a milestone`, judged against the step-2 rule.
- **Type label:** the type label it has, or the missing one, named from `labels.json` (for example `bug`, `enhancement`, `documentation`). A label the repo lacks goes into a note as a proposal.
- **Priority:** the repo's priority labels if it has them, otherwise high, medium or low, always with the reason ("crashes on start for every user").
- **Depends on:** issues this one needs first, from the body ("depends on", "blocked by", "after #") and from the code.

Done when every open issue in `issues.json` has one row.

## 4. Find ordering conflicts

For each `depends on`, compare milestones. An issue whose dependency sits in a later milestone (by `due_on`, otherwise by version order), or in none, cannot ship as planned: record the pair and both milestones.

Done when every dependency is checked and each conflict names both issues and their milestones.

## 5. Report

The answer is exactly these parts, in order:

1. One line: repo, main SHA, number of open issues.
2. One table, one row per open issue: `# | Title | Verdict | Evidence | Milestone | Labels | Priority`. Proposed changes go in the cells: `v0.6 → v0.7`, `+bug`.
3. At most 5 notes, most important first: milestone descriptions that do not match how the user or the issues use them, ordering conflicts, labels the repo lacks, issues to close. Fold smaller findings into the table.
4. One question: which of the proposed changes to apply.

Done when the answer has these four parts and nothing else.

## 6. Apply what the user approved

Apply only the changes the user approved, by issue:

```bash
gh issue edit <n> --add-label <label> --remove-label <label> --milestone "<title>"
gh issue close <n> --reason "not planned" --comment "<verdict and evidence>"
```

Check each change landed:

```bash
gh issue view <n> --json labels,milestone,state
```

Done when every approved change shows in `gh issue view`, and the reply lists what was applied and what was left as is.

## Example

The user asks to triage `acme/widget` (12 open issues). The milestone rules read "v1.2: bug fixes only" and "v1.3: export formats". Worker rows come back, among them:

```
#41 | already fixed | 9c1e2ab "fix: guard empty config", src/config.ts:88 | fits (v1.2) | bug | low: fixed, close | depends on: none
#44 | still valid | src/export.ts:30 writes CSV only | move to v1.3 | +enhancement | medium: three users asked | depends on: #47
#47 | still valid | no JSON writer in src/export.ts | fits (v1.3) | enhancement | medium: blocks #44 | depends on: none
```

#44 moves to v1.3 with #47, so no ordering conflict remains. The user calls v1.2 "the next release", but its description says bug fixes only: that becomes note 1, with the choice to move #44 or rewrite the description.
