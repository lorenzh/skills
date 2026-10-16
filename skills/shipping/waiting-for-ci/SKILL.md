---
name: waiting-for-ci
description: Waiting on CI runs, PR checks, package registries and background processes without hanging. Use when an agent must wait for a GitHub Actions run or PR checks to finish, wait until a published version appears on npm or another registry, wait for a background job or another agent, stop a background process or local server, or when a wait loop never ends, an agent has gone silent or finished without a completion notice, or a PR check or CI job failed and its log is empty or the cause is unclear.
---

# Waiting for CI

Wait for an external result with a command that ends on its own, and check real state instead of guessing.

**Every wait has an end condition the waiting command can see, and a timeout.**

## 1. Pick the wait command

| Waiting for | Command |
|---|---|
| One workflow run | `timeout 60m gh run watch <run-id> --exit-status` (exit code is the run's result; 124 is the deadline) |
| All checks on a PR | `timeout 30m gh pr checks <n> --watch --fail-fast` |
| The run a push started | Find the run for that commit (below), then watch it as above |
| A process you started | Its PID: `timeout 30m bash -c 'while kill -0 <pid> 2>/dev/null; do sleep 10; done'` |
| A process found by name | `pgrep -f '[p]attern'` (bracket the first letter) to get the PID, then wait on the PID |
| A version on a registry | The bounded loop in step 2 |

The deadlines are tunable defaults; pick one per wait, never none.

To find the run a push started, match it to the pushed commit and the workflow, not to "the latest run": an older or unrelated run on the same branch can be the latest. The run takes a few seconds to appear, so wait for it with a limit:

```bash
sha=$(git rev-parse HEAD)
for i in $(seq 1 30); do
  id=$(gh run list --workflow <workflow> --commit "$sha" --json databaseId -q '.[0].databaseId')
  [ -n "$id" ] && break
  sleep 10
done
[ -n "$id" ] || { echo "no run for $sha"; exit 1; }
```

Never wait with `while pgrep -f "<pattern>"; do ...; done`. The loop's own shell has `<pattern>` on its command line, so `pgrep` always finds it and the loop never ends. The bracket form `[p]attern` still matches the target process but not the literal `[p]attern` text in the shell's command line. A PID is better still.

Never kill by pattern from a command that contains that pattern. In the measured case, `pkill -f '<pattern>'` matched its caller's shell and ended it with exit 144. To stop a process you waited on or started, `kill <pid>`; for a server, take the PID from its port: `kill $(ss -ltnp | grep ':<port> ' | grep -o 'pid=[0-9]*' | cut -d= -f2)`.

Done when the wait command is chosen and it ends by itself when the result is in.

## 2. Bound every poll

A poll without a limit hangs forever when the result never comes (a failed publish, a wrong version string). Use a fixed number of tries:

```bash
ok=; last=
for i in $(seq 1 30); do
  last=$(npm view <pkg>@<dist-tag> version 2>/dev/null)
  [ "$last" = "<version>" ] && ok=1 && break
  sleep 20
done
[ -n "$ok" ] || { echo "timeout: <pkg>@<dist-tag> is '$last', want <version>"; exit 1; }
echo ready
```

30 tries at 20 seconds is 10 minutes, a default you can tune. The loop keeps the last value and exits non-zero on a timeout, so a caller cannot mistake a timeout for success. Stop the work that depends on the result and report the last value. Registry CDNs lag: `npm view` can show the old version for a few minutes after a successful publish.

Done when the loop printed `ready`, or the timeout is reported with the last observed value.

## 3. Run long waits in the background

Start waits longer than about two minutes with the harness background option, so the session stays responsive and receives a completion notice. Do not use `nohup ... &`: the measured run produced no completion notice. Note the PID or job id and the log path. If the harness has no background option, report the missing capability and ask how to proceed.

Done when the wait runs in the background and its PID or job id and log path are noted.

## 4. Check state, do not assume it

When a background wait, a run or another agent goes quiet, look before you report:

- Run: `gh run view <run-id> --json status,conclusion,jobs`.
- Process: `kill -0 <pid>` and the tail of its log.
- Agent: its last output and whether its process or job still exists.

A silent agent may have finished, crashed or be stuck in a loop. Report what the check showed, not what you expect.

Done when the report states each wait's observed status.

## 5. Diagnose a failed check

When a job failed and its log is empty or the cause is unclear, find the cause before you change the PR:

1. Read the raw job log. Get the job id from `gh run view <run-id> --json jobs`, then run `gh api repos/{owner}/{repo}/actions/jobs/<job-id>/logs`. It holds the step output even when `gh run view <run-id> --log-failed` or `--log` prints nothing, and names the failing test or step.
2. Compare the failure with the PR's changed files: `gh pr view <n> --json files -q '.files[].path'`.
3. Check the default branch's recent runs of the same workflow:

   ```bash
   default=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
   gh run list --branch "$default" --workflow <workflow> -L 5 --json conclusion,headSha,createdAt
   ```

   If the default branch fails the same test, report it as broken there, not caused by the PR, and leave the PR unchanged.
4. Run that single test locally 5 times (a tunable default).
5. For a failure unrelated to the diff, or a timeout or network error on a step that passed before, rerun only the failed jobs once with `gh run rerun <run-id> --failed` and watch with a deadline. A second failure is real; report its log.
6. If the unrelated test passes on the rerun, offer to open an issue for the flaky test instead of changing the PR.

Done when the report states each wait's observed status and, for a failed job, includes its raw log evidence and whether the failure matches the PR diff.

## 6. A background agent with no completion notice

An agent can finish without the harness telling you. Once its expected time has passed (a tunable default: twice the time similar tasks took, at least 10 minutes), stop waiting for the notice and look:

1. Read its last messages from its transcript. Claude Code keeps one per subagent at `~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`:

   ```bash
   jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' <transcript> | tail -40
   ```

   Other harnesses keep similar logs (Codex: `~/.codex/sessions/`); the CLI's `-o <file>` output is the final message.
2. Check the result the agent was meant to produce: the PR state (`gh pr view <n> --json state,headRefOid`), the output file, the pushed commit.
3. Check the agent's runtime status and progress before you name a state. The transcript alone can mislead: a transcript that stopped growing can end in a tool call that is still running (a long test, a `gh run watch`), and a growing one can be a loop that repeats the same calls.
   - Runtime status: the harness's agent or task list (Claude Code: the background task list or `ListAgents`), or the process (`kill -0 <pid>`).
   - Last entry: `tail -1 <transcript> | jq -c '{type, tools: [.message.content[]? | select(.type=="tool_use") | .name]}'` shows whether it ends in a tool call that has no result yet.
   - Progress: compare the last 10 tool calls; the same call with the same input again and again is a loop.
4. Name the state from all three checks:
   - **Done:** the transcript ends in a final answer, the runtime shows the agent as finished, and the result exists. Use that result.
   - **Working:** the runtime shows it running, and it is waiting on a tool call or making new calls.
   - **Stuck:** it repeats the same calls, or waits on one tool call far past that tool's own deadline. Report it with the repeated call and stop it.
   - **Failed:** the runtime shows it ended, and the result does not exist. Report its last message.

Done when each silent agent is reported as done (with its result), working (with its pending or latest call), stuck (with the repeated call) or failed (with its last message).
