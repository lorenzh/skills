# Architecture lens

Read this when step 3 judges structure: layers, dependencies, module boundaries, where code lives.

## Baseline, in this order

1. Written: instruction files, docs, architecture notes, configured boundaries (import lint, layer checks). What they say is the baseline.
2. If the written sources do not cover the case: find comparable places.
   - Same role as the changed code: sibling files, files with the same name pattern, callers and callees of the changed symbol, earlier commits that did the same kind of change.
   - Need at least the `comparable-places` setting, all doing the same thing. If they differ from each other, there is no baseline.
   - Skip anything the docs mark as deprecated. Prefer newer places.
3. If docs and code disagree, the docs win. Put the disagreement under Not checked.

With no baseline, write "Architecture: no baseline" under Not checked and report nothing.

## Deviations

- an import across a layer, or a cycle
- a second way to do what the repo does one way
- a file in the wrong place by the layout rules
- a new dependency where an existing helper or the standard library does the job

Unusual alone is not a deviation. "I would build it differently" is not a finding. A deviation that the PR or intent explains, and no written rule forbids, is not a finding.

## Proof

- Written rule: quote it (file:line) and the violating line.
- Comparable places: a command and its output, for example "7 of 7 comparable places do X, the diff does Y", with the path list. For imports, compare the import graph before and after.

## Level

| Basis | Highest level |
|---|---|
| Written rule, and the repo's own check is red | needs fix |
| Written rule, no check | should fix |
| Comparable places only | can fix |

A pattern is an inference, not a requirement, so it never blocks.
