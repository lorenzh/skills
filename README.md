# skills

Agent skills for coding agents: Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI and any other agent that reads the open [Agent Skills](https://agentskills.io) format.

A skill is a folder with a `SKILL.md` file. It teaches an agent one workflow, step by step, and can bring scripts and reference files with it. The agent loads a skill only when a task needs it.

## Skills

| Category | Skill | What it does |
|---|---|---|
| research | [researching-with-two-models](skills/research/researching-with-two-models/SKILL.md) | Has two researchers from different model families answer one brief, checks each disagreement against primary sources, and writes one report. |
| terminal | [driving-terminal-apps](skills/terminal/driving-terminal-apps/SKILL.md) | Drives, tests, screenshots and records terminal apps (CLIs, TUIs, REPLs) through tmux, like a person at the keyboard. |
| video | [directing-videos](skills/video/directing-videos/SKILL.md) | Plans, scripts and paces a video (demo, screencast, tutorial, launch video), then checks the finished cut against the plan. |
| publishing | [listing-a-project](skills/publishing/listing-a-project/SKILL.md) | Finds active awesome lists and directories for a project, follows each one's submission rules, and submits only with the owner's consent per target. |
| video | [editing-videos](skills/video/editing-videos/SKILL.md) | Crops, zooms and captions recordings into per-beat clips, joins them with crossfades, and exports square, vertical or landscape MP4s with ffmpeg. |

## Install

You need Node.js 18 or later. The [`skills` CLI](https://github.com/vercel-labs/skills) finds the skills in this repo and installs them for the agents on your machine.

```bash
# List the skills in this repo
npx skills add lorenzh/skills --list

# Install one skill
npx skills add lorenzh/skills --skill driving-terminal-apps

# Install all skills
npx skills add lorenzh/skills
```

By default the CLI installs into the current project. Add `-g` to install for your user, in all projects:

```bash
npx skills add lorenzh/skills --skill directing-videos -g
```

Keep installed skills up to date:

```bash
npx skills update
```

To install without the CLI, copy a skill folder into your agent's skills folder, for example `~/.claude/skills/<name>/` for Claude Code.

## Requirements per skill

| Skill | Needs |
|---|---|
| researching-with-two-models | Two agent runtimes of different model families, for example a pinned Claude subagent and the `codex` CLI. |
| driving-terminal-apps | Node.js 18+ and `tmux`. For recordings: `asciinema` and `agg`. For PNG and MP4: `ffmpeg` (without it, the skill makes GIFs). |
| directing-videos | Python 3 for the coverage check. It hands recording to a recorder skill, such as `driving-terminal-apps` or a browser automation skill. |
| listing-a-project | `gh` CLI, authenticated. |
| editing-videos | Node.js 18+ and `ffmpeg` with the `drawtext` and `xfade` filters (for example the BtbN static build; the johnvansickle 7.0.2 static build has no `drawtext`). |

## Layout

```
skills/<category>/<name>/   one skill; the CLI installs this folder
  SKILL.md
  references/               optional, read on demand
  scripts/                  optional, Node.js or Python 3, no dependencies
evals/<category>/<name>/    test scenarios for the skill; not installed
templates/                  source for new skills
scripts/                    validator and scaffolder
```

Evals sit outside `skills/`, so an install copies only what the agent reads.

## Contributing

Issues and pull requests are welcome. A new skill needs evidence that it changes what an agent does:

1. Scaffold it: `node scripts/new-skill.mjs <category>/<name>`.
2. Run the task on a fresh agent without the skill and write what goes wrong to `evals/<category>/<name>/evals.json`. If the agent already does the task well, the skill is not needed.
3. Write the skill so that each failure is addressed, then run the same scenarios with the skill.
4. Run `node scripts/validate-skills.mjs` and `npm test`. Both must pass.

[AGENTS.md](AGENTS.md) has the full conventions.

## License

[MIT](LICENSE)
