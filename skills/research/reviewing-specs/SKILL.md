---
name: reviewing-specs
description: Multi-perspective specification review with parallel role subagents, an independent cross-check and one synthesis report. Use when the user asks to review a spec, design doc or RFC from several perspectives, to review the spec with parallel subagents, to pre-mortem a design doc, or to find gaps and risks in a spec before implementation; also for "Spezifikation aus mehreren Blickwinkeln prüfen", "Spec gründlich prüfen mit Subagents" or "Review der Spec vor der Umsetzung".
---

# Reviewing Specs

Find a specification's weaknesses, gaps, contradictions and risks before implementation, and deliver them as one cross-checked report.

**Every finding names a place in the spec or a gap; an agent that wrote no analysis confirms each strong finding before it reaches the report.**

## Settings

| Setting | Controls | Allowed values | Default |
|---|---|---|---|
| report-path | Where the report goes | path; `<spec-dir>` and `<spec-name>` expand | `<spec-dir>/<spec-name>-review.md` |
| roles | Analysis roles | comma-separated role IDs from the roles reference, plus `name: focus` extras | all nine roles |
| role-report-lines | Size cap of one role report | whole number | 60 |
| cross-check-lines | Size cap of the cross-check | whole number | 120 |

The review is read-only for the spec and the current design: change neither. Agents write only their own report file.

## 1. Resolve settings and inputs

Read [references/settings.md](references/settings.md) and print one `settings:` line per setting.
Inputs: the spec (required), the system context, the current design, and the relation (replaces, extends, or rebuilds parts of the current system).
If an input other than the spec is missing, derive it from the conversation and the repo. State all derived choices in one line. Ask only for what cannot be derived.
Choose the report language: the language the project's instruction files require for spec documents; otherwise the user's language.
Create a work folder outside the repo, `<scratch>/<spec-name>-review/`.
Done when the settings lines, the one-line input choices and the report language are printed, and the work folder exists.

## 2. Prepare the shared brief

Do this yourself, without a subagent. Read the whole spec. Number its sections (§1, §2 …) in a section map.
Write `<work>/brief.md` with the spec path, the section map and two summaries of 15 lines or fewer each.
The spec summary names purpose, core components, central assumptions and explicit non-goals. The current-design summary names components, data flows and known weak spots, with file references.
Done when `brief.md` holds the section map and both summaries within their caps.

## 3. Run the role analyses in parallel

Read [references/roles.md](references/roles.md) for each role's focus. Start one agent per role in the same turn.
Each brief holds `brief.md`, the spec, the role's focus, [templates/role-report.md.tmpl](templates/role-report.md.tmpl) verbatim, and the `role-report-lines` cap.
Tell each agent: write the report to `<work>/<role-id>.md`, then reply only `done <file> <finding count>`. If an agent cannot write files, save its reply to that file at once.
Give the comparison role (COMP) an agent with web access; a sandboxed CLI agent often has no network. If a model router picks one without network, override it and say why in one line.
If several model families are available, spread the roles across them.
Record each agent's model from the runtime: the CLI's log or header line, or the pinned agent definition. Never take it from the answer text.
If the user adds a requirement while roles run, add it as a question to the briefs of roles not yet started. Or start one extra role in the same format. Record each added question.
Done when every role has a non-empty `<work>/<role-id>.md` and a runtime model is recorded per role.

## 4. Cross-check the findings

Start one new agent that wrote no analysis; if possible, use a model family that wrote few or none of the role reports.
Give it the spec, `brief.md` and the work folder. It must:
1. Check every critical and high finding against the spec: confirmed, weakened (new severity) or rejected (reason). Look for spec text the analyst missed.
2. Check each CURR regression: really missing, or renamed or moved?
3. Spot-check at least 3 COMP source URLs.
4. List duplicate groups: finding IDs that describe the same problem.
5. List claims in the spec itself, and citations in the reports, that are wrong.
It writes `<work>/cross-check.md` within `cross-check-lines`. Send findings that arrive later to this same agent.
Done when `cross-check.md` has a verdict for every critical and high finding, the duplicate groups and the corrections list.

## 5. Write the synthesis report

Copy [templates/report.md.tmpl](templates/report.md.tmpl) to the `report-path` and fill every slot from the work folder files, not from memory.
Merge each duplicate group into one row and list every role ID that found it. Use the severity after the cross-check.
Put rejected findings, corrections to the spec's own claims, and wrong citations in the corrections section.
Answer each question the user added mid-run in its own appendix.
Before you hand off, check that every role file, `cross-check.md` and the report exist and are non-empty.
Done when the report file exists, no `<…>` slot is left, and the user has its path and the overall verdict.

## Example

Input: "Review this spec from several perspectives: docs/specs/042-sync.md." The context and current design are not given.
Action: derive both from the repo and say so in one line, run nine roles into the work folder, cross-check, merge.
Result: `docs/specs/042-sync-review.md`; eight roles' recovery findings appear as one row with eight role IDs.

## References

- Read [references/settings.md](references/settings.md) when step 1 starts.
- Read [references/roles.md](references/roles.md) when step 3 writes the role briefs.
- Copy [templates/role-report.md.tmpl](templates/role-report.md.tmpl) into each role brief in step 3.
- Copy [templates/report.md.tmpl](templates/report.md.tmpl) when step 5 starts.
