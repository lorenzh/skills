---
name: planning-milestones
description: GitHub release planning for open issues. Use when the user asks which issues go into the next patch or minor release, to spread the backlog over the upcoming milestones, to balance milestones, to plan the next release, or to move issues so that they fit together best. Not for judging whether single issues are still valid or fit their milestone (use triaging-issues).
---

# Planning milestones

Decide which open issue ships in which release, show the plan as one table, and apply it to GitHub only after the owner approves.

**A milestone is a set of issues that can ship together: a dependency sits in the same or an earlier milestone, the work that touches the same files sits in one release, and no release holds more than the others can bear.** A plan that splits by title keywords breaks the dependency order and produces merge conflicts.

This skill starts where `triaging-issues` ends. Take verdicts (still valid, partly fixed, already fixed, duplicate, obsolete, unclear) from that skill; this skill does not repeat them. When no triage is fresh, apply the same evidence rule: check each issue against `origin/$main` with a `file:line`, SHA or PR, and leave a guess as `unclear`.

## 1. Collect the inputs

Collect the repo state with the commands of `triaging-issues` step 1: fetch, find the default branch `$main` and record its SHA, write the open issues and open milestones to a temp directory, and read single issues with `gh issue view --json`. Add `number` to the milestone fields, for the fallback in step 7:

```bash
gh api --paginate 'repos/{owner}/{repo}/milestones?state=open' --jq '.[] | {number, title, description, due_on}' > "$t/milestones.json"
```

Take three inputs:

1. The open issues whose verdict is `still valid`, and for each `partly fixed` issue the remaining work the triage verified; plan that remaining work as the issue. Leave out `already fixed`, `duplicate`, `obsolete` and `unclear`; report them as a note and route them back to `triaging-issues`.
2. The open milestones with number, description and due date. Order them by due date, otherwise by version.
3. The owner's stated theme and caps for the next release. If the request names no theme or caps, ask once in the same reply as the plan, or proceed with "none named"; do not invent a theme.

Done when the temp directory holds both lists and you have written down the main SHA, the milestones in order, each with its rule, plus the theme and caps (or "none named").

## 2. Mark what is not capacity

An issue that needs a decision from the owner (a name, a scope, a design choice) or a check the agent cannot run (a platform, a device, a service the agent has no access to) is `blocked on owner`. It gets a milestone proposal only as a tentative note, and it does not count toward any milestone's count or size. A blocked issue counted as ready makes a release look full of work nobody can finish.

Done when every issue is either ready or `blocked on owner` with the missing decision or check named.

## 3. Estimate size and find dependencies

For each ready issue, read the code it touches and write down the files or module, and a size from that reading:

- `S`: one function or file, no new behaviour to design.
- `M`: several files in one module, or a new source or view.
- `L`: several modules, a data or API change, or a design concept.

A size comes from the code, never from the title. Dependencies come from the body ("blocked by", "after #"), from issue comments and from the code (one change needs a function another adds).

An issue that depends on a `blocked on owner` issue is blocked too: mark it `blocked on owner: waits for #<n>` and take it out of the counts.

Done when every ready issue has files or module, a size and a `depends on` entry (an issue number or `none`), and every issue that depends on a blocked issue is marked blocked.

## 4. Group and order

Place the issues by these rules, in rank order; when two rules conflict, the higher one wins:

1. Dependency order and milestone rules: a dependency sits in the same or an earlier milestone than the issue that needs it, and each issue fits its milestone's description rule ("bug fixes only"). An issue that breaks a rule is a mismatch to report, not a reason to rewrite the description.
2. Urgency: regressions, crash and data-loss bugs go into the earliest milestone whose rule allows them.
3. A big design change (a layout concept, a rewrite) goes into the last milestone; its small prerequisites go earlier.
4. Same files: issues that edit the same file go into one release, one after another, so one stack of PRs avoids merge conflicts. A small fix to a file that a later redesign rewrites goes earlier than the redesign: `#2` and `#11` (small fixes in `pane.tsx`) ship before `#5` (the new pane layout that rewrites `pane.tsx`).
5. Same user-visible theme: issues that a user sees as one change go together.

Order inside a release:

1. Regressions and data-loss or crash bugs.
2. Fixes that other issues build on.
3. Features.

Done when every ready issue has one proposed milestone, or `unassigned: no milestone fits` with the reason, and each dependency sits in the same or an earlier milestone.

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

An answer in this shape (table cut to three rows):

```
owner/demo @ 4f2a9c1: 9 ready, 2 blocked on owner

| Issue | Proposed milestone | Reason | Depends on |
|---|---|---|---|
| #21 Data loss when the sync file is locked | v1.2 | data loss; fits "fixes only" | none |
| #24 Sync over SSH | v1.3 | feature; needs the transport #22 adds | #22 |
| #27 Sync to a NAS share | blocked on owner: needs a NAS the agent cannot reach | tentative v1.3 | none |

v1.2: 4 issues (3 S, 1 M)
v1.3: 5 issues (2 S, 2 M, 1 L)

Apply this plan, and record it?
```

Change nothing on GitHub before the owner replies. A move notifies every watcher and cannot be quietly undone.

Done when the reply holds the table and the question and no GitHub state has changed.

## 7. Apply what the owner approved

Apply each move by milestone title, the same way `triaging-issues` does:

```bash
gh issue edit <n> --milestone "<title>"
```

If that fails with a GraphQL error on `projectCards`, apply by milestone number through the REST API instead:

```bash
gh api -X PATCH repos/{owner}/{repo}/issues/<n> -F milestone=<milestone number>
```

Re-read up to 3 times, 5 s apart (tunable); report a move as applied only when the read shows the new milestone. The API lags, and the first read can show the old state.

```bash
gh api repos/{owner}/{repo}/issues/<n> --jq '{number, milestone: .milestone.title, state}'
```

Never close an issue here, and never edit a milestone description; a closing is a `triaging-issues` decision, and a description is the owner's. Record the plan only when the owner agreed: one short comment or a tracking issue that lists each milestone's issue numbers.

Done when each approved move shows the new milestone in the re-read, and the reply lists what was applied, what was left and where the plan was recorded (or "not recorded").
