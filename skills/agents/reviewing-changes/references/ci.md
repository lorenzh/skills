# CI for the reviewed commit

Read this when step 2 starts. The goal: the report holds the CI result of the head sha, fetched when it exists, run locally when it does not.

## 1. Find a run for the head sha

Run the fetch command first. A missing remote or upstream is no reason to skip it. Only after the command fails, write "not available" and quote the error line; then run locally (section 3).

- GitHub Actions: `gh run list --commit <head_sha> --json databaseId,status,conclusion,headSha,name` and `gh pr checks <pr>`.
- Azure Pipelines: `az pipelines runs list --query "[?sourceVersion=='<head_sha>']"`.
- Other CI: use the CLI or API the repo documents. If none is documented, ask the user.

Accept a run only when its head sha equals the full head sha. A pull-request run on a merge ref reports the PR head sha; record both shas if they differ.
Done when the run id, its sha and the label SAME or DIFFERENT are written down, or "no run" is, or the quoted error line of the failed command is.

## 2. Decide

- Finished run, same sha: fetch the result, the job table, the failed logs and the reports. Do not rerun.
- Run still going: review meanwhile. Wait at most the `ci-local-minutes` setting, then run locally.
- No run, or a run for another sha: run locally (section 3) and write DIFFERENT or "no run".
- A job failed for infrastructure or timeout reasons: rerun that job once. If it passes, add a note, not a finding.

## 3. Run locally

- Check that the working tree is clean and equals the head sha. If not, stop and say so.
- Read the steps from the CI configuration. Run only build, test, lint, typecheck and analysis steps.
- Never run deploy, publish, release or any step that needs a secret. Never run against production or shared systems.
- Start the run in the background and review meanwhile. Stop it at the `ci-local-minutes` cap and write "not finished" under Not checked.

Done when the command, its exit code and the steps skipped (with reason) are written down.

## 4. Evaluate before the report

Do this after the review work and before step 5 writes anything.

- Red job on the branch: a needs-fix finding. The proof is the failing step's log excerpt with the run id, at most 15 lines, step name in the first line.
- The same failure on the merge-base (its last run, or the failing command run on the base): legacy, not a finding of this branch.
- Reports (test counts, lint, coverage drop, code-scanning alerts for this sha): a new alert or a coverage drop is a finding at the level its effect earns. A report without a visible effect is nothing.
- A green run that never runs the changed code: mark the criteria it cannot observe `[CODE-ONLY]` and list it under Not checked. It is a finding only where it hides changed behaviour no other finding covers.
- Green run: no log excerpt. Show the job table and one Reports line.
- Before pasting any log, check it for secrets, tokens, private hostnames and machine paths.

Done when the report data holds source, run id, sha, result, the job table, the Reports line and, if red, the excerpt.
