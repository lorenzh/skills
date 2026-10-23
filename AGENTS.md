# AGENTS.md

Agent skills for anyone, installed with the `skills` CLI (`npx skills add lorenzh/skills`).
No build and no dependencies — the deliverables are the skill folders.

## Commands

| Task | Command |
|---|---|
| Scaffold a skill | `node scripts/new-skill.mjs <category>/<name>` |
| Scaffold a tier-2 skill with evals | `node scripts/new-skill.mjs <category>/<name> --evals` |
| Validate all skills | `node scripts/validate-skills.mjs` |
| Run script tests | `npm test` |
| List what the CLI discovers | `npx skills add ./ --list` |
| Install one skill locally | `npx skills add ./ --skill <name>` |

## Layout

| Path | Holds |
|---|---|
| `skills/<category>/<name>/` | One skill: `SKILL.md`, optional `references/`, `scripts/`, `tests/`, `templates/` |
| `evals/<category>/<name>/` | Eval scenarios (`evals.json`) and inputs per tier-2 skill in the same category; not installed |
| `skills/agents/writing-skills/templates/SKILL.md.tmpl` | Authoritative skill skeleton for `new-skill.mjs` |
| `templates/evals/` | Tier-2 eval scaffold source for `new-skill.mjs --evals` |
| `scripts/` | Repo tooling (Node, no dependencies) |
| `.claude-plugin/` | Claude plugin manifest (`plugin.json`, one `skills` entry per category) and marketplace (`marketplace.json`) |
| `.codex-plugin/`, `.agents/plugins/` | Codex plugin manifest (`plugin.json`, `skills` is `./skills/`; Codex scans it recursively) and Codex marketplace (`marketplace.json`) |

## Categories

| Category | Holds |
|---|---|
| `publishing` | Getting a project listed and checking content before it goes public |
| `research` | Research workflows with several models and evidence checks |
| `agents` | Dispatching, reviewing and shipping work between coding agents |
| `git` | Git workflows: worktrees, branches |
| `github` | GitHub issue and milestone work |
| `terminal` | Terminal app control, captures and recordings |
| `shipping` | Releases, CI waits and landing pull requests |
| `audio` | Voice cloning and speech generation |
| `video` | Video planning, scripting, pacing, coverage checks and editing |

## Skills

| Skill | Category |
|---|---|
| [listing-a-project](skills/publishing/listing-a-project/SKILL.md) | `publishing` |
| [researching-with-two-models](skills/research/researching-with-two-models/SKILL.md) | `research` |
| [checking-before-publishing](skills/publishing/checking-before-publishing/SKILL.md) | `publishing` |
| [writing-skills](skills/agents/writing-skills/SKILL.md) | `agents` |
| [competing-implementations](skills/agents/competing-implementations/SKILL.md) | `agents` |
| [reviewing-across-families](skills/agents/reviewing-across-families/SKILL.md) | `agents` |
| [dispatching-codex](skills/agents/dispatching-codex/SKILL.md) | `agents` |
| [creating-worktrees](skills/git/creating-worktrees/SKILL.md) | `git` |
| [driving-terminal-apps](skills/terminal/driving-terminal-apps/SKILL.md) | `terminal` |
| [directing-videos](skills/video/directing-videos/SKILL.md) | `video` |
| [editing-videos](skills/video/editing-videos/SKILL.md) | `video` |
| [building-narrated-slideshows](skills/video/building-narrated-slideshows/SKILL.md) | `video` |
| [suggesting-skills](skills/agents/suggesting-skills/SKILL.md) | `agents` |
| [cutting-releases](skills/shipping/cutting-releases/SKILL.md) | `shipping` |
| [retargeting-stacked-prs](skills/shipping/retargeting-stacked-prs/SKILL.md) | `shipping` |
| [waiting-for-ci](skills/shipping/waiting-for-ci/SKILL.md) | `shipping` |
| [landing-parallel-prs](skills/shipping/landing-parallel-prs/SKILL.md) | `shipping` |
| [triaging-issues](skills/github/triaging-issues/SKILL.md) | `github` |
| [reproducing-bugs](skills/github/reproducing-bugs/SKILL.md) | `github` |
| [planning-milestones](skills/github/planning-milestones/SKILL.md) | `github` |
| [filing-issues](skills/github/filing-issues/SKILL.md) | `github` |
| [using-gh-rest](skills/github/using-gh-rest/SKILL.md) | `github` |
| [cloning-voices-with-kittentts](skills/audio/cloning-voices-with-kittentts/SKILL.md) | `audio` |
| [mixing-audio](skills/audio/mixing-audio/SKILL.md) | `audio` |

## Conventions

- Keep skills generic; values that differ per user or project become settings; see [settings.md](skills/agents/writing-skills/references/settings.md).
- `name` in frontmatter equals the folder name: lowercase letters, digits, hyphens, max. 64 characters, never "anthropic" or "claude".
- Keep skills exactly two levels deep: `skills/<category>/<name>/`. Category names use lowercase letters and single hyphens.
- Keep skill names unique across categories. The frontmatter name equals the leaf folder name.
- Keep `SKILL.md` out of the repo root, `skills/` and category folders. Those files shadow the skills below them.
- Keep template files as `*.tmpl`. When `skills/` is empty the CLI searches the whole repo and scans any `SKILL.md` it finds, including a template's.
- Put eval scenarios and eval run output under `evals/<category>/<name>/`, outside the skill folder. Each eval folder must match a skill in the same category. `evals/**/results/` is gitignored.
- Write placeholders for local paths in `skills/` and `evals/`: `<scratch>/…`, `/home/<user>/…`. The validator rejects `/home/<name>`, `/Users/<name>`, `C:\Users\<name>` and `/tmp/claude-<uid>/-…` paths outside `evals/**/results/` (ASCII names of letters, digits, `.`, `_`, `-` only); only placeholders and the exact fake names in `FIXTURE_NAMES` (`scripts/validate-skills.mjs`) pass. It also rejects likely secrets (tokens, keys, passwords); fixtures use placeholders or the fake values in `FIXTURE_SECRETS`.
- Link every file in `references/` from `SKILL.md`; the validator fails on a link to a missing file.
- Write skill scripts in Node ≥18 ESM (`.mjs`) or Python 3, standard library only. Repo tooling under `scripts/` stays Node. Name a skill's runtime in the README requirements table.
- `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json` carry the same `version`. The bump-version workflow raises the patch on every push to main. Do not bump by hand in PRs. Keep `marketplace.json` versionless.

## Writing a skill

[writing-skills](skills/agents/writing-skills/SKILL.md) is the authoritative guide for authoring and testing skills.

- Tier-2 evals live in `evals/<category>/<name>/evals.json`.
- Before a commit that touches `skills/`, run `node scripts/validate-skills.mjs`. It must exit 0.

## Git

- Commit messages without AI attribution lines.
