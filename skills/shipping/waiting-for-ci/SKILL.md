---
name: waiting-for-ci
description: Waiting on CI runs, PR checks, package registries and background processes without hanging. Use when an agent must wait for a GitHub Actions run or PR checks to finish, wait until a published version appears on npm or another registry, wait for a background job or another agent, stop a background process or local server, or when a wait loop never ends or an agent has gone silent or finished without a completion notice.
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

The same trap kills: `pkill -f '<pattern>'` also matches the shell running it and ends that shell (exit 144) before the rest of the command runs. To stop a process you waited on or started, `kill <pid>`; for a server, take the PID from its port: `kill $(ss -ltnp | grep ':<port> ' | grep -o 'pid=[0-9]*' | cut -d= -f2)`.

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

A wait longer than about two minutes goes in the background (the harness's background mode, or `nohup ... > <log> 2>&1 &`), so the session stays responsive. Note the PID or job id and the log path.

Done when the wait runs in the background and its PID or job id and log path are noted.

## 4. Check state, do not assume it

When a background wait, a run or another agent goes quiet, look before you report:

- Run: `gh run view <run-id> --json status,conclusion,jobs`.
- Process: `kill -0 <pid>` and the tail of its log.
- Agent: its last output and whether its process or job still exists.

A silent agent may have finished, crashed or be stuck in a loop. Report what the check showed, not what you expect.

If a job failed with a timeout or a network error on a step that passed before, rerun it once with `gh run rerun <run-id> --failed`. A second failure is real: report it with the failing step's log.

Done when the report states the observed status (passed, failed with the step, still running with its last log line) for every wait.

## 5. A background agent with no completion notice

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
