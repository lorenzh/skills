# Diagnosing a silent background agent

Check all three sources before you name the agent's state.

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
