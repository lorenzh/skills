# Harness Notes

Keep the workflow executable as plain instructions; harness features supplement those instructions.
These checks and fixes use the core's global budget.

## Frontmatter

`name` and `description` are the portable fields used by this guide.
Treat other fields as harness-specific; check the target harness's current documentation before adding them.
Claude Code fields such as `allowed-tools`, `context`, hooks, and `disable-model-invocation` do not establish portable enforcement.
If a field controls a gate, state the same gate and completion evidence in the body.
If invocation is manual, state its entry conditions in the body too.
Do not assume another agent enforces or rejects an unfamiliar field.

## Questions

If structured questions are available, use them; otherwise ask in plain text.
Use the elicitation reference's question count and artifact slots in either form.
Claude Code can expose `AskUserQuestion`; Codex can expose request-user-input tools.
Check the active tool schema for question limits, option limits, and free-text behavior.
If the interface supplies a free-text option, do not add a duplicate option.
Do not treat a preselected recommendation as an answer.

## Fresh sessions and model identity

A built-in subagent or a new non-interactive agent session can provide a cold run.
Pass a self-contained brief with prompt, files, expected artifact, and the skill.
Keep the author's earlier explanation out of the brief.
Record the actual answering model from runtime evidence.
Do not infer model identity from the requested model alone.
Choose the smallest model of the current generation the author can reach without pinning a model ID in the portable skill.
If dispatch fails, report the concrete error; do not claim that the requested model ran.
Fresh sessions count as checks within the current global review round.

## Portability check

1. Check one scenario in another harness when reachable.

   Claude Code and Codex are examples, not requirements.
   Use a dispatch surface already available; a skills directory on disk does not prove execution is reachable.
   Give one real request without naming the target skill.
   Record whether discovery and the required action both occurred.
   If another harness is unreachable, inspect the body once with named tools, restrictions, hooks, and subagents assumed absent.
   List each instruction that cannot execute under that assumption.
   Done when the record contains action evidence or an explicit portability limit for each blocked instruction.

2. Run available harness validators.

   If the repo has a skill validator, run it.
   If the target harness provides a validator, check its current command before running it.
   Claude Code plugin validation and Codex skill loading test different packaging surfaces.
   A clean validator result does not establish discovery or correct behavior.
   Done when the record contains validator output and names any packaging checks that were unavailable.
