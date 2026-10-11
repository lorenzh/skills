# Testing a Claude Code plugin or mod live

Use with the process in `../SKILL.md`. The extra rules for Claude Code as the app under test:

- **Start command.** From the clean stage folder:
  `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 ENABLE_CLAUDEAI_MCP_SERVERS=false CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1 claude --plugin-dir <plugin> --model haiku --setting-sources project,local --settings <stage>/settings.json --strict-mcp-config`
  Haiku keeps the run cheap; the env and flags keep the user's instructions, memory and MCP servers off screen.
- **Settings.** Put `"tui": "fullscreen"`, `"spinnerTipsEnabled": false` and a `permissions.allow` list for exactly the tool calls the scenario makes into `<stage>/settings.json`; a permission prompt stops the run. Check for it: `node "$T" cap <name> | grep 'Do you want'`.
- **The user's real install** (upgrade tests, `claude plugin ...` commands) writes `~/.claude/settings.json`. Copy it first (`cp -p ~/.claude/settings.json <stage>/settings.json.bak`) and restore it after with `cp -p`, then `cmp` both: the restore must be byte for byte.
- **Ready text.** Wait for `for shortcuts|manual mode` before typing.
- **Slash commands.** After `Enter` on a command that opens a pane, `wait` for the pane's own text before the next key; keys sent in the first ~1.5 s go to the prompt.
- **After a key that moves rows** (a list that grows, a tab switch), keep the 0.2 s gap from `../SKILL.md` step 4: Claude Code drops keys sent within ~0.1 s.
- **Colours and focus.** The focus ring is drawn inverse (`\e[7m`): `node "$T" cap <name> -e | grep $'\e\[7m'` shows what has focus.
- **Plugin panes in a check.** Find the pane by its frame before matching (rules in `screen-checks.md`): docked at the bottom, its left edge is the longest vertical border run that reaches the bottom rule; inline in the transcript, it is a `╭` with a `╰` below it in the same cell column.
- **Plugin errors** appear as a dim line `<plugin>: <event> ... refused: <reason>` in the transcript; `grep refused` the capture after each step.
- **Nothing private on screen:** no tokens, no account e-mail, no work repositories; the session uses the user's login, so do not open `/status` or `/login` in a recording.
