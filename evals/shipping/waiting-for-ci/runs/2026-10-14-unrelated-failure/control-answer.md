Model: claude-opus-5-5

I haven't run anything, so I don't know the cause yet. Below is what the facts suggest and the commands I'd run, in order.

## What the facts point to

- **Empty logs don't mean the job passed.** Both `--log-failed` and `--log` printed nothing, so they're no help here. The job's status, its steps and its annotations will say what happened.
- **The job may never have reached a command that prints anything.** Common causes are hitting `timeout-minutes`, losing the runner, or being cancelled; in those cases GitHub records the reason in an annotation, not in the log. `gh` can also print nothing when it can't match step names inside the log archive; the jobs log API avoids that.
- **A change to `AGENTS.md` can't break typecheck, tests or build.** It can break lint if lint checks Markdown (prettier or markdownlint). So I'd still check the failing step before calling it a flaky run.

## Commands, in order

**1. Find the run and the job**
```bash
gh pr view 50 --json headRefName,headRefOid,files
gh pr checks 50
gh run list --commit <head-sha> --json databaseId,workflowName,conclusion,attempt
```

**2. Check the job's state** (the skill's "check state, do not assume it" step)
```bash
gh run view <run-id> --json status,conclusion,attempt,jobs \
  --jq '.jobs[] | select(.name=="check") | {databaseId, conclusion, startedAt, completedAt, steps: [.steps[] | {name, status, conclusion}]}'
gh run view <run-id>                                          # prints the ANNOTATIONS section
gh api repos/{owner}/{repo}/check-runs/<job-id>/annotations
```

**3. Get the log directly**
```bash
gh api repos/{owner}/{repo}/actions/jobs/<job-id>/logs > /tmp/check-50.log
tail -n 100 /tmp/check-50.log
```

**4. Compare with `main`**: do recent `check` jobs pass, and how close is their run time to the job's timeout?
```bash
gh run list --workflow <workflow> --branch main --limit 5 --json databaseId,conclusion,createdAt,updatedAt
```

## What I'd do next, depending on what that shows

**A. Infrastructure failure**: a timeout, a lost runner, a network error, or a step that passes on `main`. The skill allows one rerun. The job takes over 2 minutes, so the wait runs in the background with a deadline:
```bash
gh run rerun <run-id> --failed
gh run view <run-id> --json attempt,status     # confirm a new attempt is queued
nohup timeout 30m gh run watch <run-id> --exit-status > /tmp/watch-50.log 2>&1 &
# note the PID; exit 0 = green, 124 = deadline hit, anything else = failed
```
If `main`'s `check` runs are also close to `timeout-minutes`, a passing rerun is luck. The real fix is a higher timeout or splitting the tests. That change is outside this PR, so I'd tell you about it rather than make it.

**B. Lint actually fails on `AGENTS.md`**: I'd check out the PR, run only the lint step (not the full 6-minute check), fix the file and push. Then I'd wait for the run that matches the pushed commit, not just the latest run:
```bash
gh pr checkout 50
bun run lint                                   # reproduce
# fix AGENTS.md, e.g. the repo's formatter on that one file
bun run lint                                   # confirm it passes
git commit -am "Fix AGENTS.md formatting" && git push
sha=$(git rev-parse HEAD)
for i in $(seq 1 30); do
  id=$(gh run list --workflow <workflow> --commit "$sha" --json databaseId -q '.[0].databaseId')
  [ -n "$id" ] && break; sleep 10
done
[ -n "$id" ] || { echo "no run for $sha"; exit 1; }
nohup timeout 30m gh run watch "$id" --exit-status > /tmp/watch-50.log 2>&1 &
```

**C. The rerun fails again**: the skill treats that as a real failure. I'd stop and report it with the failing step's log from step 3. I wouldn't rerun again.

## How it ends

The PR is green, or I report one of these:
- the failing step and its log lines
- the timeout, with the last log line from the watch

Either way I'd report what the commands actually showed.
