---
name: dispatching-across-families
description: Dispatches work to a model of the other family, with Claude Code calling GPT models through the Codex plugin or the Codex CLI, and Codex calling Claude models through the Claude Code CLI, and checks which model actually answered. Use when the user asks for a second opinion, a cross-family review or model diversity, when a Claude Code session should use a GPT model, or when a Codex run should use a Claude model.
---

# Dispatching Across Families

Sends one task to a model of the other family and proves from runtime evidence which model answered.

**A dispatch counts only when the runtime shows the requested family answered. A model's own claim about its identity does not count.**

## 1. Pick the models

Take the model list from the `discovering-agent-models` skill. Pick a model of the other family and an effort level that it supports. Use only models with visibility `list` unless the user names another one.

Done when the model and the effort level are named, and both appear in the current list.

## 2. Dispatch from Claude Code to a GPT model

Use one of these two routes:

- The Codex plugin. Run `/codex:rescue` for implementation or diagnosis, or `/codex:review` for review. Pass the raw request with the model and effort flags. A detailed brief can make the forwarder answer as Claude, so keep the request short.
- The Codex CLI directly:

  ```
  codex exec -m <model> -c model_reasoning_effort=<effort> -s read-only \
    --skip-git-repo-check -o <result-file> - < <brief-file>
  ```

  Use `-s workspace-write` only when the task must edit files.

Done when the job has started and its output file or job id is known.

## 3. Dispatch from Codex to a Claude model

Run the Claude Code CLI in non-interactive mode:

```
claude -p --model <model> --effort <effort> --output-format json < <brief-file> > <result-file>
```

A review brief must forbid edits. After the run, check `git status` in the worktree. An unexpected change means the brief did not hold, and the result does not count as a review.

Done when the result file exists and the worktree shows no unexpected change.

## 4. Check which model answered

Trust the runtime record over the model's own words.

- Codex: the run header shows `model: <slug>`. Read it from the run's output or stderr.
- Claude Code: in the `--output-format json` result, the `modelUsage` object is keyed by the model ids that answered. Read the keys.

A model's own statement about its identity is not evidence. A GPT model can write that it is Claude after reading a Claude-heavy brief.

Done when both the requested model and the runtime's model record are noted for this dispatch.

## 5. Handle a mismatch

If the runtime record shows the same family as the implementer, or shows no record, the dispatch does not count as cross-family. Tell the user that the requested model was not available. Do not substitute another model silently. Do not call the result an independent review.

Done when the user has the requested model, the answering model, and a plain statement of whether the dispatch counts.

## 6. Feed the result back

Give the result to the session that asked for it, with the model record and the dispatch's status from step 5. A review result goes on to the review loop: a blocker or should-fix goes to the implementer, not to the orchestrating session.

Done when the result is in the session that asked for it, with its model record.
