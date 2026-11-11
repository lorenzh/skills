---
name: auditing-repo-structure
description: "Structural review of a pull request or a whole repository that measures first and reports findings by weight. Use when the user asks 'what else do you notice', wants an architecture review, asks why a change touches so many files, whether packages duplicate each other, or whether a layer has grown too heavy."
---

# Auditing repo structure

Report how a change or a repository is built, as findings that each rest on a measurement and a file reference.

**Measure before you judge.** A finding from a file name or a size alone is a guess; mark it "not read" or read the file.

Stay read-only. Filing issues or editing code starts only after the user picks findings.

## 1. Fix the scope

Name the target: one PR number, a branch, or the whole checkout. Read the repo's instruction file for its layering rules, because a finding is a deviation from a rule the repo states or from a pattern it already follows.

Done when the reply names the target and quotes the rule or pattern the review compares against.

## 2. Measure

Run each of these that fits the target and keep the output:

- **Change surface (PR):** files with additions and deletions (`gh pr view <n> --json files`). Mark each docs or config file whose edit only restates a count, a list or an enumeration of kinds.
- **Weight:** lines of source and tests per package or top-level directory (`git ls-files` piped to `wc -l`), and the largest files.
- **Dependencies:** internal dependencies from the manifests, as one list `package → depends on`.
- **Duplication:** for sibling packages, compare same-named files after replacing the product name with one token (`diff <(sed 's/a/X/g' f1) <(sed 's/b/X/g' f2) | wc -l`). Count function names that repeat across packages (`grep` the definitions, `sort | uniq -c`).

Done when each measurement is in the notes with its command, or is skipped with a reason.

## 3. Read what the numbers point at

Open the files behind the three largest or most repeated results. A size alone does not make a module wrong, so read enough to say what it holds.

Done when each candidate finding cites `path:line` or is marked "not read".

## 4. Write the findings

Order by weight: structure first, duplication next, docs churn and naming last. Each finding has:

- the fact with its measurement and reference,
- the consequence for the next change,
- one direction, or two options with their cost.

Say what you did not read or run. Drop a finding that you cannot tie to a measurement.

Done when every finding has fact, consequence and direction, and the reply lists what was not checked.

## 5. Offer the next step

End with the findings you would file as issues or fix, and one question: which ones. Do not file or change anything before the answer.

Done when the reply ends with that question.

## Example

Input: "What else do you notice in this repo?" after a PR that added three similar packages.
Action: step 2 shows `options.ts` identical across two packages and the CLI at 70% of all lines. Step 3 reads both. Step 4 lists "two packages duplicate the delivery code (diff: 0 lines in `options.ts`)" first and "CLI holds the runner subsystem (2,900 lines)" second.
Result: five findings with references and a closing question.
