# Terminal reproduction checks

Read before every terminal run. These checks apply with an automation helper or with direct tmux commands.

## Worktree and stage

Use the project's prescribed worktree setup when available. Keep the checkout at the recorded default-branch SHA.
Check that the worktree directory is ignored before creating it. Install dependencies inside the checkout using its lockfiles.
Check that dependencies and config resolve inside it; do not silently use another checkout's install or symlink dependencies.
Copy local files only with approval; never copy secrets without the user naming them. Report missing files and affected checks.
Run the project's baseline tests before reproduction. If they fail, report them and ask whether to continue.
If isolation is blocked by permissions, report the denial and stop; do not bypass it or test unmerged edits instead.
Before removal, check for uncommitted files and unpushed commits. Keep unexpected work and ask; never force-remove it.

## Start, drive and capture

If a terminal-automation skill or tool is available, use it. Otherwise use these tmux operations:

```bash
tmux -L <socket> list-sessions
tmux -L <socket> new-session -d -s <session> -x <cols> -y <rows> env LANG=C.UTF-8 <command> <arg>...
tmux -L <socket> send-keys -t =<session> -l '<literal text>'
tmux -L <socket> send-keys -t =<session> Enter
tmux -L <socket> capture-pane -p -t =<session>
tmux -L <socket> capture-pane -p -e -t =<session>
tmux -L <socket> kill-session -t =<session>
```

- Refuse a socket that already has sessions. Arm cleanup only after startup succeeds; end only the session you own.
- Pass the command and arguments separately, with `env` first. Never interpolate paths into a shell command string.
- Start in the empty stage. Use the issue's size or 120x35, and `LANG=C.UTF-8` unless the test needs another locale.
- Poll the capture for text that proves input readiness, for at most 30 seconds (tunable). Then wait 1 more second.
- A ready timeout is a setup error: save the screen and exit 2. A failed screen assertion exits 1.
- Send text literally and keys separately. After each action, wait for its visible effect with an explicit deadline.
- Keep at least 0.2 seconds between keys that redraw. Read the captured screen after any timeout.
- Save start and failure captures. For colour or focus, preserve ANSI attributes and check the expected row's attribute.
- After stopping, check processes with a bracketed pattern, such as `pgrep -fa '[a]pp'`. Ignore the automation wrapper shell.
- Stop only remaining processes belonging to this run, including detached children. Confirm none remain.

The core uses `cap` for plain capture and `cap -e` for ANSI capture.
Use the corresponding `capture-pane` commands above. `type` means literal `send-keys -l`; `key Enter` means `send-keys ... Enter`.
A `wait` means polling captures for the expected pattern with a deadline.

## Screen assertions

- Locate the app's frame by its border corners and runs. Check only inside that region, including user-supplied expected patterns.
- A missing frame is a setup error for a framed app. For a plain CLI or REPL, use the unique output marker instead.
- Count terminal cells: Wide/Fullwidth characters and emoji take 2; combining and zero-width marks take 0.
- Do not use string length as a column count. Anchor columns on plain-text neighbours of joined emoji; tmux versions differ.
- For each spoof, keep a negative fixture using a fake `tmux` first on `PATH` that prints a canned screen.
- Assert failure when expected text appears only in a transcript, quoted label or another box outside the app.
- State residual limits in the check script's usage, such as an exact copied frame. Stop instead of adding spoof heuristics.

## Claude Code plugins and mods

Start from the clean stage with isolated settings:

```bash
CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 ENABLE_CLAUDEAI_MCP_SERVERS=false CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1 claude --plugin-dir <plugin> --model haiku --setting-sources project,local --settings <stage>/settings.json --strict-mcp-config
```

- Use Haiku first. In the stage settings, set `"tui": "fullscreen"` and `"spinnerTipsEnabled": false`.
- Allow exactly the tool calls the scenario makes through `permissions.allow`. Check captures for `Do you want` permission prompts.
- For real-install upgrade or plugin tests, first back up `~/.claude/settings.json` with `cp -p`.
- Restore it with `cp -p` afterward and verify byte-for-byte equality with `cmp`.
- Wait for `for shortcuts|manual mode` before typing. After a pane-opening slash command, wait for the pane's own text.
- Keys in the first roughly 1.5 seconds can go to the prompt. Keep the 0.2-second gap after row-moving keys.
- Check focus through inverse ANSI (`\e[7m`), not text alone.
- Find a docked pane by the longest vertical border reaching the bottom rule.
- Find an inline pane by `╭` and `╰` in the same terminal-cell column.
- After each step, check the transcript for `refused` plugin errors.
- Keep tokens, account emails and work repositories off screen. Never open `/status` or `/login` in a recording.
