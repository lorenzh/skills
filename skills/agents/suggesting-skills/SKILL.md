---
name: suggesting-skills
description: Skill suggestions mined from the current session. Use when the user asks which skills could be extracted from this session, asks for skill ideas or "Vorschläge für Skills"; and, without being asked, when a task wraps up, before context is compacted or cleared, after the same workflow ran two or more times, or right after a hard-won fix or workaround was found.
---

# Suggesting skills

Find workflows in this session that are worth a skill, check them against the skills that already exist, and offer a short list grouped into three kinds. **Suggest skills only: no AGENTS.md rules, docs, notes or script ideas. Create or edit a skill only after the user picks it.**

Run these steps at a pause: after a task is done or before compaction. During active work, note the candidate and wait for the next pause.

## 1. Collect candidates from the session

Scan the session (and its summary, if context was compacted) for:

- A multi-step workflow that ran two or more times (release cutting, PR retargeting, CI waiting).
- A sequence that needed several attempts or a user correction before it worked. Each correction is evidence.
- A hard-won fix: a failure whose cause took real digging (disk full, a self-matching `pgrep` loop).
- A command chain that had to run in an exact order.

Skip one-off solutions, project conventions that belong in `AGENTS.md`/`CLAUDE.md`, and rules a linter or script can enforce.

Done when you hold a list of candidates, each with one piece of concrete evidence from the session (the command, the error, the correction).

## 2. Check existing skills

List the skill roots that exist on this machine: `~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills`; `.agents/skills`, `.claude/skills`, `.codex/skills` in the repo; and the skills of installed plugins (Claude Code: `~/.claude/plugins/**/skills`). The harness's own skill listing, if it shows one, counts too. Read the `name` and `description` of every `SKILL.md`. For each candidate, find the closest match. A candidate that a skill already covers becomes an **update** to that skill. It is a new skill only when no existing skill fits.

Then put each candidate in one group:

- **User skills**: personal, depends on this user's setup, tools or habits. Lives in the user's global skill root (for example `~/.agents/skills`).
- **Project skills**: specific to the current repository, its commands or its conventions. Lives in the repo's skill root (for example `.agents/skills`).
- **Skills for lorenzh/skills**: generic, no user or project values, useful to anyone. Lives in `lorenzh/skills` under `skills/<category>/<name>/`; user-specific values become settings.

When unsure between user and generic, choose generic and name the values that would become settings.

Done when every candidate is marked `new` or `update: <skill-name>` and sits in one group.

## 3. Rank and present

Rank by value inside each group: how often it recurs, times how much it cost this session. Show at most five in total. Print the three group headings in this order and omit a heading that has no candidate. Use this format, one block per candidate:

```markdown
### User skills
1. **<verb-first-name>** (new | update: <existing-skill>)
   - Trigger: <when an agent should load it, in user words>
   - Encodes: <the steps or rule it would hold, one line>
   - Evidence: <what happened in this session, one line>

### Project skills
…

### Skills for lorenzh/skills
…
```

End with one question: which ones to create or update. When this skill runs on its own initiative, keep the whole message to a few lines (names plus one-line reason) and offer the full list.

Keep suggestions private: no employer or customer names, internal project names, hosts, tokens or secrets. Describe the general technique instead.

Done when the list is shown and the question is asked. Stop here until the user answers.

## 4. Create the chosen skills

For each candidate the user picked, load a skill-authoring skill (such as `writing-skills`) if one is installed and follow it, with the session evidence from step 1 as its baseline material. For an `update`, edit the existing skill instead of making a new one.

Make the change in the skill's source repository, never in the installed copy: an update overwrites it (`npx skills update`, or `/plugin update` for a plugin). Check how the skill was installed first. A skills-CLI install has an entry in `~/.agents/.skill-lock.json` (global) or `skills-lock.json` (project); `source` and `skillPath` name the repository. A plugin install has no lock entry and sits under `~/.claude/plugins/cache/<marketplace>/<plugin>/`; `~/.claude/plugins/known_marketplaces.json` gives the marketplace's `source.repo`, and the skill's path in that repository follows the plugin's `skills` entries in its `plugin.json`. A new skill goes to the root of its group: the user's global skill root, the project's skill root, or `lorenzh/skills`. Open one branch and one pull request per skill, follow that repository's `AGENTS.md` (validator, evals, commit rules), and leave the merge to the user.

Done when each chosen skill has its own open pull request in its source repository and passes that skill's checks (or, without one, has valid `name` and `description` frontmatter and numbered steps), or the user stops the work.
