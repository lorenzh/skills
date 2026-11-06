# Work findings into the spec

Read this only when the user requests spec edits from findings or open design problems.
The lead is the main session that holds the user's intent.
Keep the current design and implementation read-only.

Use at most `round-limit` integration and verification passes per request, including the first pass. The default is 3.
Before dispatch, choose an integrator from family A and a read-only verifier from the other family.
Record both models from runtime evidence, as in the review steps.
If the other family is unavailable, report the limit and stop before editing.

## 1. Decide what to integrate

The lead decides each finding or open problem: take, weaken, reject, or choose an option. Record the reason.
If no good option exists, get two independent answers from two model families to one shared brief, with evidence for each proposal.
Then synthesize the answers, checking each disagreement against the evidence before deciding.
If that capability has no owner, report the gap and ask how to proceed.

The lead fills [the integration brief](../templates/integrate-brief.md.tmpl) at `<work>/integrate-<round>.md`.
Number every decision. Name its finding IDs and the source file containing detailed text.
Where reviewer wording binds the edit, write "as the cross-check says" and cite its exact section.
For user-owned names, defaults and behavior choices, the lead asks the user rather than silently deciding.
Until answered, label any proposed choice as awaiting user confirmation. Do not present it as settled.
Done when the brief records every decision and distinguishes user answers from pending choices.

## 2. Back up the spec

Before each integration or fix pass, copy the spec to `<work>/<spec-name>-pre-<round>.md`.
Use the next unused round number. Never overwrite a backup from an earlier request.
Check that the copy matches the spec before allowing edits.
If the copy is missing or differs, stop before editing.
Keep each backup and its brief for diffing and rollback. Do not restore a backup over later edits without user direction.
Done when a matching backup exists and its path is in the integration brief.

## 3. Integrate the decisions

Give the integrator the filled brief, spec, backup and source files. It edits the spec in place.
Before editing, the integrator checks that the named backup matches the spec. If absent or different, stop and report the gap.
Keep everything the brief does not name.
Use the spec's numbered decision list and list of unverified points. Preserve existing decision numbers.
Add each new or changed decision to the numbered list.
If either list is missing, add it in one place and name that location in the application report.
Mark new decisions "needs confirmation" and changed decisions "changed, needs a new confirmation".
Add acceptance criteria for new behavior.
Add a round section mapping each finding or decision to the spec location that resolves it.
For rejected findings, map to the recorded rejection and reason instead.
Update the spec's list of unverified points, including unresolved user choices.
The integrator returns applied decision IDs and unapplied IDs with reasons through the runtime.
The lead saves that application report as `<work>/application-<round>.md`, as with the verification report.
Done when the edited spec and `<work>/application-<round>.md` exist with confirmation markers, criteria, mapping and unverified points.

## 4. Verify the edited spec

Fill [the verification brief](../templates/verify-brief.md.tmpl) at `<work>/verify-<round>.md`.
Give the verifier the spec, backup, integration brief, application report and proposals or other source files.
The verifier stays read-only. It checks every decision against the brief and its binding source text.
It checks the diff for contradictions introduced elsewhere in the spec.
It returns must-fix items and notes, plus "ready to implement" or "not ready to implement".
Each must-fix item needs an ID, spec location and failure scenario: input or state → wrong result.
A must-fix claim without that scenario is a note. Notes do not trigger fixes.
If the verifier claims readiness while a decision remains unapplied, the lead returns that gap for correction.
Done when `<work>/verification-<round>.md` contains the checks, scenarios, notes and verdict with the runtime model recorded.

## 5. Fix must-fix items

If must-fix items remain and budget remains, send only those items to the integrator. Reuse its session when possible.
Keep their failure scenarios and binding wording in the next integration brief.
Repeat the backup and integration steps before the next verification pass.
Give the verifier its earlier report and this pass's backup (the previous verified spec) to compare the edits.
It rechecks only earlier must-fix items and the new edits for regressions. It marks each earlier ID resolved or open.
Do not turn notes into work during this loop.
Stop at readiness or `round-limit`. At the cap, hand open items to the user without another pass.
Done when the last verification has no must-fix items or the limit is recorded with open IDs and scenarios.

## 6. Disclose lead edits

If the lead edits after the last verification, record the location and exact change as not verified.
Do not apply the earlier readiness verdict to the edited version.
Done when each such edit appears in the unverified list and handoff, or the lead made none.

## 7. Hand off the result

Tell the user the last verdict and verifier's runtime model. Name the version or backup comparison it covers.
List decisions needing confirmation by their numbers in the spec. Ask the questions only the user can decide.
List open must-fix items, unverified points and lead edits after verification. Include the spec and backup paths.
Technical readiness does not confirm user-owned decisions.
If the user later requests a decision change, start a new backed-up round with a new brief and verification.
Done when the user can see the verdict's scope, pending confirmations, questions and remaining uncertainty.
