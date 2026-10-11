# AGENTS.md

Personal agent skills, installed by users with the `skills` CLI (`npx skills add lorenzh/skills`).
No build and no dependencies — the deliverables are the skill folders.

## Commands

| Task | Command |
|---|---|
| Scaffold a skill | `node scripts/new-skill.mjs <category>/<name>` |
| Validate all skills | `node scripts/validate-skills.mjs` |
| Run script tests | `npm test` |
| List what the CLI discovers | `npx skills add ./ --list` |
| Install one skill locally | `npx skills add ./ --skill <name>` |

## Layout

| Path | Holds |
|---|---|
| `skills/<category>/<name>/` | One skill: `SKILL.md`, optional `references/`, `scripts/`, `tests/`, `templates/` |
| `evals/<category>/<name>/` | Eval scenarios (`evals.json`) and inputs for the skill in the same category; not installed |
| `templates/` | Scaffold source for `new-skill.mjs` |
| `scripts/` | Repo tooling (Node, no dependencies) |

## Categories

| Category | Holds |
|---|---|
| `publishing` | Getting a project listed and found |
| `research` | Research workflows with several models and evidence checks |
| `terminal` | Terminal app control, captures and recordings |
| `video` | Video planning, scripting, pacing, coverage checks and editing |

## Skills

| Skill | Category |
|---|---|
| [listing-a-project](skills/publishing/listing-a-project/SKILL.md) | `publishing` |
| [researching-with-two-models](skills/research/researching-with-two-models/SKILL.md) | `research` |
| [driving-terminal-apps](skills/terminal/driving-terminal-apps/SKILL.md) | `terminal` |
| [directing-videos](skills/video/directing-videos/SKILL.md) | `video` |
| [editing-videos](skills/video/editing-videos/SKILL.md) | `video` |

## Conventions

- `name` in frontmatter equals the folder name: lowercase letters, digits, hyphens, max. 64 characters, never "anthropic" or "claude".
- Keep skills exactly two levels deep: `skills/<category>/<name>/`. Category names use lowercase letters and single hyphens.
- Keep skill names unique across categories. The frontmatter name equals the leaf folder name.
- Keep `SKILL.md` out of the repo root, `skills/` and category folders. Those files shadow the skills below them.
- Keep template files as `*.tmpl`. When `skills/` is empty the CLI searches the whole repo and scans any `SKILL.md` it finds, including a template's.
- Put eval scenarios and eval run output under `evals/<category>/<name>/`, outside the skill folder. Each eval folder must match a skill in the same category. `evals/**/results/` is gitignored.
- Link every file in `references/` from `SKILL.md`; the validator fails on a link to a missing file.
- Write skill scripts in Node ≥18 ESM (`.mjs`) or Python 3, standard library only. Repo tooling under `scripts/` stays Node. Name a skill's runtime in the README requirements table.
- Before a commit that touches `skills/`, run `node scripts/validate-skills.mjs`; it must exit 0.

## Writing a skill

- Record the baseline first: run the task without the skill and write the failures to `evals/<category>/<name>/evals.json`. If the agent already succeeds, there is no skill to write.
- `description`: what the skill is in a few words, then one "Use when …" trigger per use case, in the user's words. Third person, 120–700 characters, no process steps — an agent follows a summarised process and skips the body.
- Body: title, one-line purpose, core principle, numbered steps. Each step ends on a line `Done when …` that names an observable file, output, or state.
- `SKILL.md` stays under 300 lines. Put material only some runs need in `references/`.
- Phrase rules positively. Give the consequence of skipping a rule instead of capitals.
- Test with the `evals/<category>/<name>/` scenarios on a fresh agent, with and without the skill, on the same model. A scenario counts only if the run without the skill fails it.

## Git

- Commit messages without AI attribution lines.
