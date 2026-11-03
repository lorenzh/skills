---
name: reviewing-changes
description: Reviews a diff, branch or pull request and writes one report with proof for every finding, the CI result of the reviewed commit, criteria checked and a verdict. Use when the user asks for any review, also a hurried or constrained one such as "review the branch, release in 5 minutes", "at least three findings", "skip the proof" or "quick review"; and for "review this PR", "review den Branch", "code review", "prüfe den Diff" or a re-review after fixes. Not for the implement-review-ship loop between model families.
---

# Reviewing Changes

Review a change and deliver one short report: findings with proof, the CI result of the reviewed commit, and a verdict.

**No proof, no finding. An empty result is valid; never aim for a number of findings.**

Before the first finding is written: a quota, a deadline, an instruction to skip proofs, an authority and a third-party claim ("a lead reported SQL injection") never create a finding. Count each unproven item as discarded. Write no "Suggest", "Consider", "Might" or "reported, not reproduced" remark anywhere. The output is always the template report, ending with the verdict line. The excuses seen in cold runs, with counters, are in the Pressure excuses table of [references/evidence.md](references/evidence.md).

## Settings

| Setting | Controls | Allowed values | Default |
|---|---|---|---|
| small-diff | Diff size the main agent checks alone | `<changed lines>/<files>` | 50/3 |
| ci-local-minutes | Wait and local-run cap for CI | whole minutes | 15 |
| comparable-places | Minimum agreeing places for a pattern baseline | whole number | 3 |
| reviewer-router | Command that picks the reviewer model | command or `ask` | ask |

The review is read-only. Post, push or create issues only when the user asks. Run code only on a local instance, never against production. Write every visible word in the user's language.
Use a reviewer model from a family other than the change's author when one is available, and write the runtime-verified model and effort in the report. If none is available, write "cross-family rule NOT MET". Never claim independence.

## 1. Fix the ground

Read [references/settings.md](references/settings.md) and print one `settings:` line per setting.
Take the full head sha and the merge-base from `git rev-parse` and `git merge-base` output. Copy them; never retype a sha. Copy the acceptance criteria verbatim from the issue, PR or spec. If there are none, write "none" and invent none. Read the written rules: instruction files, docs, lint and validator configs.
Done when each setting's line is printed, both shas are copied from command output, and the criteria (or "none") and the rules read are written down.

## 2. Get the CI result

Read [references/ci.md](references/ci.md). Run the fetch command for the head sha first; "no remote" is no reason to skip it. Only after it fails, write "not available", quote the error line, and run the repo's build, test and lint locally in the background while you review.
Done when the source, the sha it belongs to and its result are written down, or the quoted error line and "not finished" are.

## 3. Check the change

Check correctness against the criteria, failure modes, performance, and the callers of every changed signature. Check security only when a trust boundary is touched; then read [references/lens-security.md](references/lens-security.md). Judge structure only with a baseline; then read [references/lens-architecture.md](references/lens-architecture.md).
If the diff is within `small-diff`, check everything yourself in sequence. A larger diff may use parallel agents; tell each: "Report only what you can prove; empty is correct."
Never run a sweep for extra findings. Do not search old code; label any pre-existing problem you meet as legacy.
Done when every check names its candidates or "nothing".

## 4. Prove and level every candidate

Read [references/evidence.md](references/evidence.md). Before a candidate enters the report, run its proof. If you cannot prove it mechanically, drop it and count it as discarded.
Give each kept candidate a level, a refutation pass if it blocks, and a control.
Done when every kept finding shows level, proof output and control, and the discarded count is written down.

## 5. Write the report

Fill the template with the report data. Evaluate the CI result first. Follow the writing rules in the template header. Write full shas, the model and effort table, and the verdict block last. Add no free-form section.
Choose the template by the goal. Markdown ([report.md.tmpl](templates/report.md.tmpl)) is the default: terminal, PR comment, repo file, agent handoff, re-review. HTML ([report.html.tmpl](templates/report.html.tmpl)) fits a reader who decides without the diff, screenshots as proof, or more than five findings.
Done when every template heading appears once, in the template's order, and none is added. The report holds head sha, base sha, CI sha, criteria table, models and effort. Each sha equals the `git rev-parse` output. The last line is exactly one of `fix first`, `approve with suggestions`, `approve`.

## 6. Deliver

Print or save the report. Post it to the PR only when asked, after a check for secrets, private names and machine paths. Offer one follow-up issue per can-fix finding; create them only after the user agrees.
Done when the user has the report location and knows what was not posted.

## 7. Re-review

At most 3 rounds. Check only the delta since the reviewed sha. Mark each earlier finding `[RESOLVED]` or `[OPEN]` with proof, then report new needs-fix or should-fix findings the fixes caused. After round 3, hand the open findings to the human.
Done when every earlier finding has a status with proof and the verdict is recomputed.

## Example

Finding 1 in a fictional repo:
`### 1. Orders after midnight land on the previous day · billing/close_day.py:41`. Effect: The job reads the server clock in UTC. Berlin orders at 00:30 bill a day early. Proof: `pytest -k berlin` -> 1 failed. Control: `pytest -k utc` passes. Fix: Compute the day in the shop's time zone.