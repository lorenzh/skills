# skills

Agent skills for coding agents: Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI and any other agent that reads the open [Agent Skills](https://agentskills.io) format.

A skill is a folder with a `SKILL.md` file. It teaches an agent one workflow, step by step, and can bring scripts and reference files with it. The agent loads a skill only when a task needs it.

## Skills

| Category | Skill | What it does |
|---|---|---|
| research | [researching-with-two-models](skills/research/researching-with-two-models/SKILL.md) | Has two researchers from different model families answer one brief, checks each disagreement against primary sources, and writes one report. |
| publishing | [checking-before-publishing](skills/publishing/checking-before-publishing/SKILL.md) | Scans text, recordings and frames for private data (home paths, hosts, emails, tokens, internal names) before anything goes public. |
| agents | [competing-implementations](skills/agents/competing-implementations/SKILL.md) | Runs two implementations of one brief, compares blind diffs, and ships the reviewed winner. |
| agents | [reviewing-across-families](skills/agents/reviewing-across-families/SKILL.md) | Runs a review loop where a model of another family reviews an agent's change, the implementer fixes, and the orchestrating session ships the PR. |
| git | [creating-worktrees](skills/git/creating-worktrees/SKILL.md) | Sets up git worktrees that are really isolated: in-repo placement, dependencies installed and resolving inside the worktree, local files copied only with consent, and safe cleanup. |
| terminal | [driving-terminal-apps](skills/terminal/driving-terminal-apps/SKILL.md) | Drives, tests, screenshots and records terminal apps (CLIs, TUIs, REPLs) through tmux, like a person at the keyboard. |
| video | [directing-videos](skills/video/directing-videos/SKILL.md) | Plans, scripts and paces a video (demo, screencast, tutorial, launch video), then checks the finished cut against the plan. |
| publishing | [listing-a-project](skills/publishing/listing-a-project/SKILL.md) | Finds active awesome lists and directories for a project, follows each one's submission rules, and submits only with the owner's consent per target. |
| agents | [suggesting-skills](skills/agents/suggesting-skills/SKILL.md) | Reviews the current session for repeated workflows and hard-won fixes, checks them against existing skills, and offers a ranked list of new skills or updates. Creates nothing without consent. |
| video | [editing-videos](skills/video/editing-videos/SKILL.md) | Crops, zooms and captions recordings into per-beat clips, joins them with crossfades, and exports square, vertical or landscape MP4s with ffmpeg. |
| shipping | [cutting-releases](skills/shipping/cutting-releases/SKILL.md) | Takes a release from version bump through tag, workflow and registry to a back-merge into main and a verified installed version, following the project's release document. |
| shipping | [retargeting-stacked-prs](skills/shipping/retargeting-stacked-prs/SKILL.md) | Retargets stacked pull requests onto main after their base merges, gets CI to run on them again, and merges the stack in order. |
| shipping | [waiting-for-ci](skills/shipping/waiting-for-ci/SKILL.md) | Waits on CI runs, PR checks, registries and background processes with commands that end on their own, bounded polls, and state checks instead of guesses. |
| shipping | [landing-parallel-prs](skills/shipping/landing-parallel-prs/SKILL.md) | Merges a batch of PRs that edit the same lines one at a time, updating each from main right before its merge, with the user's OK for every merge. |
| github | [triaging-issues](skills/github/triaging-issues/SKILL.md) | Checks every open issue against the current code with cited evidence, plus milestone fit, type labels, priority and ordering conflicts; reports one table and changes nothing on GitHub until the user approves. |

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

### Install as a Claude plugin

In Claude Code, add this repo as a plugin marketplace, then install the `lorenzh` plugin. It holds all skills:

```text
/plugin marketplace add lorenzh/skills
/plugin install lorenzh@lorenzh-skills
```

In Claude Desktop, open the Code tab, choose "+" > Plugins > Add plugin and enter `lorenzh/skills`.

### Install as a Codex plugin

With the Codex CLI, add this repo as a plugin marketplace, then install the `lorenzh` plugin. It holds all skills:

```bash
codex plugin marketplace add lorenzh/skills
codex plugin add lorenzh@lorenzh-skills
```

The `lorenzh/skills` GitHub form is unverified until the Codex files are on `main`. To use a local clone, run `codex plugin marketplace add ./` in the clone instead.

Verified with codex-cli 0.162.1 on a local clone, with an empty `CODEX_HOME`. `codex plugin marketplace add ./`, `codex plugin add lorenzh@lorenzh-skills` and `codex debug prompt-input` each exited 0. The prompt input listed all 15 skills as `lorenzh:<skill>`, so Codex finds the nested `skills/<category>/<name>/` folders from `"skills": "./skills/"`: checking-before-publishing, competing-implementations, creating-worktrees, cutting-releases, directing-videos, driving-terminal-apps, editing-videos, landing-parallel-prs, listing-a-project, researching-with-two-models, retargeting-stacked-prs, reviewing-across-families, suggesting-skills, triaging-issues, waiting-for-ci.

## Requirements per skill

| Skill | Needs |
|---|---|
| researching-with-two-models | Two agent runtimes of different model families, for example a pinned Claude subagent and the `codex` CLI. |
| checking-before-publishing | Node.js 18+ for the scan. For GIF or video frames: `ffmpeg`. |
| competing-implementations | Model router (such as Spatz), two implementer workers, one reviewer, `git`, Node.js 18+ for blind packets, and a PR CLI for publishing. |
| reviewing-across-families | Two agent runtimes of different model families (for example a Claude harness and Codex CLI). For shipping: Node.js 18+, `git` and `gh`. |
| creating-worktrees | Node.js 18+ and `git`. Uses the package managers the repo already uses. |
| driving-terminal-apps | Node.js 18+ and `tmux`. For recordings: `asciinema` and `agg`. For PNG and MP4: `ffmpeg` (without it, the skill makes GIFs). |
| directing-videos | Python 3 for the coverage check. It hands recording to a recorder skill, such as `driving-terminal-apps` or a browser automation skill. |
| listing-a-project | `gh` CLI, authenticated. |
| suggesting-skills | Nothing. Creating a chosen skill uses a skill-authoring skill such as `writing-skills`. |
| editing-videos | Node.js 18+ and `ffmpeg` with the `drawtext` and `xfade` filters (for example the BtbN static build; the johnvansickle 7.0.2 static build has no `drawtext`). |
| cutting-releases | `gh`, `git`. Registry CLI for the package (for example `npm`). |
| retargeting-stacked-prs | `gh`, `git`. |
| waiting-for-ci | `gh` for CI waits. |
| landing-parallel-prs | `gh`, `git`. |
| triaging-issues | `gh`, `git`. |

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
