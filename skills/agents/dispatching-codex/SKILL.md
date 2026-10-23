---
name: dispatching-codex
description: Codex CLI dispatch with completion notices that mean Codex really finished. Use when starting, dispatching or waiting for `codex exec`; when handing work to a GPT or Codex subagent; for cross-family review or verification by a GPT model; when running several Codex jobs in parallel; or when a workflow fans out to Codex.
---

# Dispatching Codex

Start `codex exec` runs so the harness reports their real end, and check each run's answer before using it.

**Codex itself is the command the harness watches. A wrapper with `nohup` or `&` exits at once, so its "completed" notice proves nothing.**

## 1. Prepare the run

Make a private output dir per dispatch, e.g. `out=$(mktemp -d)`. Put the brief in `$out/brief.md`; its line 1 asks for `Model: <your model id>`.
Pick the sandbox: `-s read-only` for research, review and verification; `-s workspace-write` only when the run must edit files.
Done when `$out/brief.md` exists and the sandbox is chosen.

## 2. Start Codex as the watched command

Run this as the whole Bash command, in the foreground or with the harness background option:

```bash
codex exec -m <model> -c model_reasoning_effort=<effort> -s <read-only|workspace-write> \
  --skip-git-repo-check -C <repo> -o "$out/answer.md" - < "$out/brief.md" > "$out/log.txt" 2>&1
```

Never add `nohup` or a trailing `&` to a run that should notify. For several parallel runs, pick one:
- one background Bash per run;
- one background Bash that starts each run with `&` and ends with `wait`;
- one background until-loop with a 60-minute deadline on the `-o` files: `timeout 60m bash -c 'until [ -s a.md ] && [ -s b.md ]; do sleep 15; done'`.

If a run was already started with `nohup` or `&`, ignore its notice and check it as in step 3.
Done when each run is the watched command, or a `wait` or the 60-minute until-loop covers it.

## 3. Check each run

A run is finished and usable only when all of these hold:
- the process is gone: `pgrep -f '[c]odex exec.*<out-dir>'` prints nothing;
- the answer file is non-empty: `[ -s "$out/answer.md" ]`;
- the log has the runtime header: `grep -m1 'model:' "$out/log.txt"`.

An empty or missing answer file after the process ended is a failed run, not a result. Report it with the log tail.
Done when each run is reported as finished (with its answer path) or failed (with its log tail).

## 4. Record the runtime model

Record the `model:` header from the log, not the `Model:` line the answer claims. If they differ, or the requested model is missing, report it; never substitute another model silently.
Done when the report names each run's runtime model and effort.

## Example

Input: two GPT reviewers in parallel. Action: one background Bash runs `codex exec … -o "$out/a.md" … & codex exec … -o "$out/b.md" … & wait`. Result: the notice arrives after both end, both files are non-empty, and each log shows `model:`.
