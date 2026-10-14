---
name: discovering-agent-models
description: Reads the model and effort list that Claude Code and Codex currently offer, from the installed tools themselves, without logging in and without running a model. Use when the user asks which models or effort levels are available, when a dispatch needs a current model id, when a model list looks stale after an upgrade, or when a script should pick from the list instead of a remembered name.
---

# Discovering Agent Models

Reads the model list a coding agent offers right now, so a dispatch uses a current model and not one remembered from training.

**The installed tool states its own model list. Read it; do not recall it.**

## 1. Read the Codex list

Run this. It needs no login and makes no network call:

```
CODEX_HOME="$(mktemp -d)" codex debug models --bundled \
  | jq -r '.models[] | [.slug, .visibility] | @tsv'
```

- `CODEX_HOME` points at an empty folder, so Codex finds no login and no settings.
- `--bundled` prints the list shipped with the binary and skips the online refresh.
- `visibility` `list` means the picker shows the model. `hide` means it does not. Dispatch only to `list` models unless the user names a hidden one.
- For the effort levels of one model, select its entry: `jq '.models[] | select(.slug=="<slug>") | [.supported_reasoning_levels[].effort]'`.

Done when the command prints one line per model with its visibility.

## 2. Read the Claude Code list

Do not run the Claude Code binary to list its models. The list sits inside the binary as text.

1. Resolve the binary: `readlink -f "$(which claude)"`.
2. Confirm the list is present: `grep -c -a 'model-catalog/v1/schema.json' <binary>`. A count of 1 or more means the catalog is there.
3. Extract the catalog block with a parser that reads it and never evaluates it. The block is a JavaScript object literal: keys are unquoted and `true` is written `!0`. Use the Spatz extractor when it is installed.
4. Keep the models in the picker's main section that Anthropic's own API offers and that are not disabled. Keep their effort levels.

Done when you have a model list with effort levels, or you report that the catalog is present but could not be parsed.

## 3. Mark what the list cannot show

The lists are package defaults. The account may lack access to a model in them. State that in the output. If a later dispatch fails with an access error, report the model as unavailable and do not substitute another one silently.

Done when the output names the source of each list and carries this caveat.

## 4. Report the lists

Give one table, one row per model:

| Agent | Model | Effort levels | Source |
|---|---|---|---|

The source is `codex debug models --bundled` for Codex and the Claude Code binary's catalog for Claude Code. Put the access caveat under the table.

Done when the table is in the reply and the caveat sits under it.
