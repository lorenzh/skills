---
name: planning-milestones
description: GitHub release planning for open issues. Use when the user asks which issues go into the next patch or minor release, to spread the backlog over the upcoming milestones, to balance milestones, to plan the next release, or to move issues so that they fit together best.
---

# Planning milestones

Decide which open issue ships in which release, show the plan as one table, and apply it to GitHub only after the owner approves.

**A milestone is a set of issues that can ship together: a dependency sits in the same or an earlier milestone, the work that touches the same files sits in one release, and no release holds more than the others can bear.** A plan that splits by title keywords breaks the dependency order and produces merge conflicts.

This skill starts where `triaging-issues` ends. Take verdicts (still valid, already fixed, duplicate, obsolete, unclear) from that skill; this skill does not repeat them. When no triage is fresh, apply the same evidence rule: check each issue against `origin/<main>` with a `file:line`, SHA or PR, and leave a guess as `unclear`.

## 1. Collect the inputs

Run in the repo's checkout, writing to a temp directory:

```bash
git fetch -q origin
t=$(mktemp -d)
gh issue list --state open --limit 1000 --json number,title,labels,milestone > "$t/issues.json"
gh api --paginate 'repos/{owner}/{repo}/milestones?state=open' --jq '.[] | {number, title, description, due_on, open_issues}' > "$t/milestones.json"
```

Read an issue with `gh issue view <n> --json number,title,body,comments,labels,milestone`, never with `--comments`: it fails on repos with Projects (classic) data.

Take three inputs:

1. The open issues whose verdict is still valid. Leave out `already fixed`, `duplicate`, `obsolete` and `unclear`; report them as a note and route them back to `triaging-issues`.
2. The open milestones with number, description and due date. Order them by due date, otherwise by version.
3. The owner's stated theme and caps for the next release. When the owner named none, ask once; do not invent a theme.

Done when the temp directory holds both lists and you have written down the milestones in order, each with its rule, plus the theme and caps (or "none named").

## 2. Mark what is not capacity

An issue that needs a decision from the owner (a name, a scope, a design choice) or a check the agent cannot run (a platform, a device, a service the agent has no access to) is `blocked on owner`. It gets a milestone proposal only as a tentative note, and it does not count toward any milestone's count or size. A blocked issue counted as ready makes a release look full of work nobody can finish.

Done when every issue is either ready or `blocked on owner` with the missing decision or check named.

## 3. Estimate size and find dependencies

For each ready issue, read the code it touches and write down the files or module, and a size from that reading:

- `S`: one function or file, no new behaviour to design.
- `M`: several files in one module, or a new source or view.
- `L`: several modules, a data or API change, or a design concept.

A size comes from the code, never from the title. Dependencies come from the body ("blocked by", "after #"), from issue comments and from the code (one change needs a function another adds).

Done when every ready issue has files or module, a size and a `depends on` entry (an issue number or `none`).

## 4. Group and order

Build the groups in this priority:

1. Dependency order: a dependency sits in the same or an earlier milestone than the issue that needs it. A chain of issues across one file set stays together so one stack of PRs avoids merge conflicts.
2. Same files or module: issues that edit the same file go in one release, one after another.
3. Same user-visible theme: issues that a user sees as one change go together.

Order inside a release:

1. Regressions and data-loss or crash bugs.
2. Fixes that other issues build on.
3. Features.

A big design change (a layout concept, a rewrite) goes to the last release; its small prerequisites go earlier. Honour each milestone's description rule ("bug fixes only"); an issue that breaks the rule is a mismatch to report, not a reason to rewrite the description.

Done when every ready issue has one proposed milestone and each dependency sits in the same or an earlier one.

## 5. Spread evenly

Balance by count and by size. Target the same count and the same S/M/L weight in every milestone the plan fills, within what the order rules allow. Report count and size per milestone, for example `v0.7: 8 issues (4 S, 3 M, 1 L)`. Flag a milestone that exceeds a cap the owner named, and say which issue to move and what it breaks.

A milestone of 14 next to one of 3 means the grouping, not the capacity, decided the plan. Rebalance by moving the issues with no dependents first.

Done when each milestone's count and size are computed and the plan has no unflagged cap breach.

## 6. Present and ask

The answer is exactly these parts, in order:

1. One line: repo, main SHA, number of ready issues, number blocked on owner.
2. One table, one row per issue: `Issue | Proposed milestone | Reason | Depends on`. Put blocked issues at the end with `blocked on owner: <what is missing>` in the milestone cell.
3. One line per milestone with count and size.
4. At most 5 notes, most important first: milestones whose description no longer matches their content (the owner decides whether the issues move or the description changes), ordering conflicts that remain, cap breaches, issues sent back to triage.
5. One question: apply this plan, and record it?

Change nothing on GitHub before the owner replies. A move notifies every watcher and cannot be quietly undone.

Done when the reply holds the table and the question and no GitHub state has changed.

## 7. Apply what the owner approved

Apply by milestone number through the REST API, never by title:

```bash
gh api -X PATCH repos/{owner}/{repo}/issues/<n> -F milestone=<milestone number>
```

Wait a few seconds, then re-read: the API lags and the first read can show the old state.

```bash
gh api repos/{owner}/{repo}/issues/<n> --jq '{number, milestone: .milestone.number, state}'
```

Never close an issue here, and never edit a milestone description; a closing is a `triaging-issues` decision, and a description is the owner's. Record the plan only when the owner agreed: one short comment or a tracking issue that lists each milestone's issue numbers.

Done when each approved move shows the new milestone number in the re-read, and the reply lists what was applied, what was left and where the plan was recorded (or "not recorded").
