---
name: researching-with-two-models
description: Two-model research workflow with researchers from different model families and one synthesizer. Use when the user asks to research an issue, question or design choice "with two models", wants a Claude and a GPT answer compared, asks for a cross-family or second-opinion research report, or wants research merged into one report or issue comment.
---

# Researching with two models

Get one research report that two model families reached independently, with every disagreement settled by evidence.

**Two researchers answer the same brief without seeing each other. The synthesizer trusts neither: it re-checks every disagreement against primary sources itself.**

Roles, each a separate agent or session:

| Role | Model | Access |
|---|---|---|
| Researcher A | family 1 (for example Claude), high effort | read-only, web allowed |
| Researcher B | family 2 (for example GPT), high effort | read-only, web allowed |
| Synthesizer | either family, or the lead | read, run commands, fetch; writes only the report |

## 1. Write one brief

Write `brief.md` in a scratch folder outside the repo. Both researchers get it byte for byte; a line added for one researcher breaks the comparison. The brief has these parts, in order:

1. **First line rule:** "Line 1 of your answer: `Model: <your model id>`."
2. **Question:** the one question to answer, with the issue text or link.
3. **Must keep:** the constraints any solution must hold (no new dependency, supported platforms, public API, ...).
4. **Rules:** "Read-only: edit no file, push nothing, post nothing. Fetch primary sources (docs, source code, issue trackers, changelogs) and cite the URL or file:line for each claim. Where a number matters, measure it and give the command. Tag a claim you could not fetch or run as `[from memory]`."
5. **Deliver:** the answer shape: `Model:`, Findings (claim + evidence each), Options (cost, risk), Recommendation, Open questions.

Done when `brief.md` holds the five parts and names no other researcher or answer.

## 2. Dispatch both researchers in parallel

Start both in the same turn, each with only `brief.md`. Each returns its answer as text; the lead or the runtime saves it to its own file (`answer-a.md`, `answer-b.md`).

- **Same family as the harness:** a subagent pinned to the model and effort (for example a Claude Code agent file with `model:` and `effort:` in its frontmatter), or a model router such as Spatz.
- **Other family:** its CLI in a read-only sandbox, for example `codex exec -m <model> -c model_reasoning_effort=high -s read-only --skip-git-repo-check -C <repo> -o answer-b.md - < brief.md`.

Give each researcher read-only access (a read-only sandbox or read-only tools); a researcher with write access can change the code the other is reading. If a chosen model is unavailable, stop and tell the user; a substitute from the same family is no longer a two-family result.

Record the model each runtime reports: the CLI's header or log line (for `codex exec`, the `model:` line it prints at start), or the pinned agent definition. Use that, not the `Model:` line, as evidence: self-reports differ from runtime headers, and a researcher may answer only with a family name such as "GPT-6". A report without a runtime model id is a report without a model.

Done when both answer files exist and you hold a runtime-reported model for each.

## 3. Synthesize and settle disagreements

Give the synthesizer `brief.md`, both answers and the two runtime models. It:

1. Lists each claim the recommendation depends on as agreed, single-source, or conflicting.
2. For every conflict, and for every `[from memory]` or uncited claim the recommendation depends on, checks it itself: re-runs the measurement, fetches the doc, reads the source. A side picked, an average, or "it depends" without a check leaves the report unproven.
3. Writes `report.md` in this shape:

```markdown
## Question
<question, and the constraints a solution must keep>
## Findings
- <claim> — <evidence: URL, file:line, or command + output> (A, B, or both)
## Disagreements
- A: <claim>. B: <claim>. Checked: <command or source> → <result>.
## Options
| Option | Cost | Risk | Keeps constraints? |
## Recommendation
<one option, why, main risk>
## Open questions
- <what no source settled>
## Models
Researcher A: <runtime model, effort>. Researcher B: <runtime model, effort>. Synthesizer: <model>.
```

Done when `report.md` has every section and each Disagreements line names the check the synthesizer ran.

## 4. Check the files landed

An agent can say it wrote a file while the write never reached the disk. Check every file before you use it:

```bash
for f in answer-a.md answer-b.md report.md; do [ -s "$f" ] && echo "ok $f" || echo "MISSING $f"; done
```

For each `MISSING` file, recover the content from the agent's transcript instead of re-running the agent: the content of its last `Write` to that path, or its final message. In Claude Code the subagent transcript is `~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`:

```bash
# the last Write to this file; an agent may write several files, or the same file twice
jq -rs --arg f report.md '[.[] | select(.type=="assistant") | .message.content[]? | select(.type=="tool_use" and .name=="Write" and (.input.file_path | endswith("/" + $f)))] | last | .input.content // empty' <transcript>
# fallback: the complete final message, every text block joined (one message can span several entries with the same id)
jq -rs '[.[] | select(.type=="assistant" and any(.message.content[]?; .type=="text"))] as $a | ($a | last | .message.id) as $id | [(if $id then $a[] | select(.message.id == $id) else ($a | last) end) | .message.content[]? | select(.type=="text") | .text] | join("\n\n")' <transcript>
```

Use the file name you are recovering in place of `report.md`. Take the whole message; a cut-off report loses its last sections.

For a CLI runtime, the `-o <file>` output or its session log holds the final message. Write the recovered text to the file and say in the report that it was recovered.

Done when every file prints `ok`.

## 5. Scan, then deliver

Before the report leaves the machine (issue comment, PR, chat), scan it for private data:

```bash
grep -inE '/(home|Users)/|[A-Za-z]:[\\]|[A-Za-z0-9._-]+[.](local|internal|lan)([^A-Za-z0-9]|$)|["'"'"']?(token|secret|password|api[_-]?key)["'"'"']?[[:space:]]*[:=]' report.md; echo "exit $?"
```

Rewrite each hit: a path to repo-relative, a username or host to a placeholder, a secret removed. Also read for employer, customer and private repo names; grep cannot know them.

Then deliver where the user asked: post it (for example `gh issue comment <n> --body-file report.md`) or hand over the file path. Without a destination, give the path and ask.

Done when the grep prints only `exit 1` (no match; `exit 2` is a scan error) and the report is posted or its path given.
