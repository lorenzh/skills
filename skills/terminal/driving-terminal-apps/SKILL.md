---
name: driving-terminal-apps
description: Terminal app automation through tmux. Use when the user asks to drive, control or test a console, CLI or TUI tool (htop, vim, a REPL, an installer, a coding agent) like a user would; to take a screenshot of a terminal app; or to record a terminal video, demo GIF or MP4. Web pages and Electron apps belong to a browser automation skill.
---

# Driving terminal apps

Run the app in its own tmux server, drive it with keys, read the screen as text, and turn captures into images and video.

**Every action waits on what the screen shows, and every run ends with the app's server stopped.**

All commands go through `node scripts/tui.mjs` in this skill's folder (run it; `node scripts/tui.mjs --help` prints the usage). Set its full path, e.g. `T="<skill dir>/scripts/tui.mjs"`, then use `node "$T" ...`. It needs Node.js 18 or later and `tmux` on `PATH`; screenshots and video need `agg`, video recording needs `asciinema`, PNG and MP4 need `ffmpeg`. It finds these three on `PATH` or in `$TUI_TOOLS` (default `~/.local/share/tui-tools`).

## Process

1. **Check the tools.** Run `node "$T" tools`. For a missing `agg` or `asciinema`, tell the user the release page it prints; without `ffmpeg`, plan GIF instead of PNG or MP4 and say so in the final answer.
   Done when every tool the task needs shows a path, or the fallback is decided.

2. **Prepare a clean stage.** Make an empty working folder under the scratch or temp directory and start the app from there. Anything on screen ends up in the image: use throwaway files and names, and keep tokens, home paths with private names, and customer data off screen. With `-r`, the cast header also stores the command line: use relative or neutral paths in the started command.
   Done when the folder exists and holds only demo content.

3. **Start the app in its own server.** `node "$T" start <name> -s 120x35 -- <cmd>`; add `-r <file>.cast` to record from the first frame. `<name>` is a fresh tmux socket name, so the user's own tmux sessions stay untouched; the app runs with `LANG=C.UTF-8` (set `TUI_LANG` to change it), so the user's language does not leak into captures. Then `node "$T" wait <name> '<ready text>' 30` for text that only appears when the app accepts input (a prompt like `>>>`, a status bar, a menu title), and sleep 1 more second: keys sent while the app still starts are lost or go to the wrong widget.
   Done when `wait` returned 0.

4. **Drive it.** One action, then one `wait` for its visible effect:
   - text: `node "$T" type <name> '<text>'` sends the characters literally (tmux would turn a bare word like `Enter` or `C-c` into a key).
   - keys: `node "$T" key <name> <Key> [secs]` (`Enter`, `Escape`, `Down`, `C-x`, `F6`, `q`); the default pause is 0.6 s. Keep at least 0.2 s between keys that redraw the screen: keys sent faster are dropped by some apps.
   - mouse: `node "$T" find <name> '<regex>'` prints `col row`; `node "$T" click <name> <col> <row>`.
   - check: `node "$T" wait <name> '<regex>' <secs>`; `wait` and `find` use JavaScript regular expressions. On timeout it prints the screen to stderr, so read it before trying again. The capture drops trailing spaces: match `\$$`, not `\$ `.
   For a recording, put the whole sequence in a script file, with a pause of 1.5–3 s (tunable) after each visible change so a viewer can read it.
   Done when the screen shows the expected end state.

5. **Capture.**
   - text evidence: `node "$T" cap <name>` (plain) or `node "$T" cap <name> -e` (with colours as ANSI codes).
   - screenshot: `node "$T" shot <name> shot.png` (needs `ffmpeg`) or `shot.gif` (one frame); `.txt` and `.ansi` also work.
   - video: stop the app or the server (step 6) so the cast closes, then `node "$T" render <file>.cast out.mp4` (or `out.gif`; pauses are cut to 3 s). Extra `agg` options go after the output, e.g. `--font-size 20`.
   - check a video: `node "$T" frame <file>.cast <secs> f.gif` renders the screen at a time; look at two or three such frames before handing the video over.
   Done when each file exists and you looked at it (open the image) or quoted it.

6. **Stop and clean up.** `node "$T" stop <name>` kills the app, its child processes and the server, and removes the socket. Then check with a bracketed pattern, e.g. `pgrep -fa '[s]leep 300'`, so `pgrep` does not match itself. Ignore the agent's own wrapper shell, which may still contain the command. A process that detached or was reparented survives `stop`; kill only leftover processes that belong to this run.
   Done when `stop` exits 0 and `pgrep` shows no remaining app processes from this run.

7. **Report.** Give the file paths, size and length of videos, what each capture shows, and any fallback (GIF instead of MP4). If the harness can send files to the user (in Claude Code, `SendUserFile`), send the images or video; otherwise give the paths.
   Done when the answer names every output file.

## Example: test a REPL

```bash
T="<skill dir>/scripts/tui.mjs"   # the folder holding this SKILL.md
node "$T" start repl -s 80x20 -- python3 -q
node "$T" wait repl '^>>>$' 10 || { node "$T" stop repl; exit 1; }; sleep 1
node "$T" type repl "print('hello')"; node "$T" key repl Enter
node "$T" wait repl '^hello$' 5 && echo PASS || echo FAIL
node "$T" cap repl | tail -3      # evidence for the report
node "$T" stop repl
```

## References

- Testing a Claude Code plugin or mod live: read [references/claude-code.md](references/claude-code.md) before the first `start` — it covers settings isolation, the cheap model and the start delay.
- `node --test "<skill dir>/tests/tui.test.mjs"` checks the helper (exit 0 when all pass; optional media checks need `agg` and `asciinema`).
