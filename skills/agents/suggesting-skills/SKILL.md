---
name: suggesting-skills
description: Skill suggestions mined from the current session. Use when the user asks which skills could be extracted from this session, asks for skill ideas or "Vorschläge für Skills"; and, without being asked, when a task wraps up, before context is compacted or cleared, after the same workflow ran two or more times, or right after a hard-won fix or workaround was found.
---

# Suggesting skills

Find workflows in this session that are worth a skill, check them against the skills that already exist, and offer a short ranked list. **Suggest only. Create or edit a skill only after the user picks it.**

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

Done when every candidate is marked `new` or `update: <skill-name>`.

## 3. Rank and present

Rank by value: how often it recurs, times how much it cost this session. Show at most five. Use this format, one block per candidate:

```markdown
1. **<verb-first-name>** (new | update: <existing-skill>)
   - Trigger: <when an agent should load it, in user words>
   - Encodes: <the steps or rule it would hold, one line>
   - Evidence: <what happened in this session, one line>
```

End with one question: which ones to create or update. When this skill runs on its own initiative, keep the whole message to a few lines (names plus one-line reason) and offer the full list.

Keep suggestions private: no employer or customer names, internal project names, hosts, tokens or secrets. Describe the general technique instead.

Done when the list is shown and the question is asked. Stop here until the user answers.

## 4. Create the chosen skills

For each candidate the user picked, load a skill-authoring skill (such as `writing-skills`) if one is installed and follow it, with the session evidence from step 1 as its baseline material. For an `update`, edit the existing skill instead of making a new one.

Done when each chosen skill passes that skill's checks (or, without one, has valid `name` and `description` frontmatter and numbered steps), or the user stops the work.
