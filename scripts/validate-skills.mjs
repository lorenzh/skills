#!/usr/bin/env node
// Errors (exit 1): missing frontmatter, name/folder mismatch, name not lowercase-hyphen,
//   name over 64 chars or holding "anthropic"/"claude", missing description,
//   description over 1024 chars, holding an XML tag or only an unfilled template slot, a relative link in AGENTS.md,
//   README.md or a skill's markdown pointing at a file that does not exist,
//   missing skills/, a SKILL.md at repo root or in
//   skills/ or a category (it shadows skills below it), invalid category names,
//   deeper skills, duplicate names, evals without a skill in the same category,
//   and, when .claude-plugin/ exists: missing or unreadable plugin.json or marketplace.json,
//   plugin.json "skills" not equal to the category folders that hold skills,
//   plugin name missing from marketplace.json, a plugin or marketplace name
//   starting with "claude-", "anthropic-" or "cc-plugin-", a "version" in plugin.json
//   or on a marketplace.json plugin entry (the commit SHA is the version); and, when
//   .codex-plugin/plugin.json or .agents/plugins/marketplace.json exists: the other one missing,
//   a Codex plugin name that differs from the Claude one, Codex "skills" neither "./skills/" nor
//   covering every category, plugin name missing from the Codex marketplace; a local path in a
//   file under skills/ or evals/ (/home/<name>, /Users/<name>, <drive>:\Users\<name>, a
//   /tmp/claude-<uid>/-… scratchpad; ASCII names of letters, digits, ".", "_", "-" only);
//   allowed: placeholders such as /home/<user>, the exact fake fixture names in FIXTURE_NAMES,
//   and the gitignored evals/**/results/ folders, which are not read.
// Warnings (exit 0): SKILL.md over its line ceiling, description outside the
//   120-700 char band, with no trigger or not third person, a standalone unfilled body
//   template slot, reference not linked from SKILL.md, skill folder without SKILL.md.
//   Body warnings: step-done-when (numbered step without Done when), bounded-loop
//   (loop instruction without a digit), sentence-length (over 30 words),
//   harness-name (Claude Code, Codex or AskUserQuestion with references/harness-notes.md).
//   These four ignore frontmatter, fenced code, inline code and table rows.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: node scripts/validate-skills.mjs

Validates skills/<category>/<name>/SKILL.md: layout, frontmatter, name rules, description
quality, that relative markdown links in skills, AGENTS.md and README.md resolve,
that .claude-plugin/plugin.json and marketplace.json match the skill categories, and that
.codex-plugin/plugin.json and .agents/plugins/marketplace.json exist together, use the Claude
plugin name, cover every skill category ("./skills/" or one entry per category) and list the plugin, and
that no file under skills/ or evals/ (except evals/**/results/) holds a home path
(/home/<name>, /Users/<name>, C:\\Users\\<name>) or a /tmp/claude-<uid>/-… scratchpad path.
It covers ASCII names of letters, digits, ".", "_" and "-" only.
Placeholders like /home/<user> pass, and so do these exact fake fixture names: jdoe,
jdoe-noreply, alice, alice.meyer, user, user-admin, runner.dev.

Body warnings (ignore frontmatter, fenced code, inline code and table rows):
  step-done-when   numbered ## N. or ### N. step without a Done when line
  bounded-loop    imperative repeat or until with a loop verb, without a digit
  template-slot   standalone unfilled body slot outside code (an unfilled description is an error)
  sentence-length sentence over 30 words
  harness-name    Claude Code, Codex or AskUserQuestion in a skill with references/harness-notes.md

Exit 0  no errors (warnings may still be printed)
Exit 1  at least one error`);
  process.exit(0);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = path.join(repoRoot, "skills");
const evalsDir = path.join(repoRoot, "evals");
const NAME_MAX_CHARS = 64;          // spec limit
const DESCRIPTION_MAX_CHARS = 1024; // spec limit
const DESCRIPTION_MIN_GOOD = 120;   // tunable: below this there is no room for triggers
const DESCRIPTION_MAX_GOOD = 700;   // tunable: above this the description summarises the body
const SKILL_MD_MAX_LINES = 300;     // tunable soft ceiling
const SENTENCE_MAX_WORDS = 30;      // tunable prose warning threshold
const errors = [];
const warnings = [];
const skillNames = new Set();
const skillPaths = new Set();
const skillCategories = new Set();
const CATEGORY = /^[a-z]+(-[a-z]+)*$/;

const rel = (p) => path.relative(repoRoot, p).replaceAll(path.sep, "/");
// "a\nb\n".split("\n") is ["a","b",""] — the trailing empty string is not a line.
const countLines = (text) => text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
const stripCode = (text) => text.replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");

// Keep Markdown structure for step boundaries; remove content excluded from body warnings.
const bodyProse = (text) => {
  let fence;
  const lines = text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
    .split(/\r?\n/).map((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
        return "";
      }
      if (marker) { fence = marker[1]; return ""; }
      return line;
    }).join("\n").replace(/(`+)[\s\S]*?\1(?!`)/g, "").split("\n");
  const tableRows = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\|/.test(lines[i])) tableRows.add(i);
    if (!/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i])) continue;
    if (i > 0 && lines[i - 1].includes("|")) tableRows.add(i - 1);
    for (let j = i; j < lines.length && lines[j].includes("|"); j++) tableRows.add(j);
  }
  return lines.map((line, i) => tableRows.has(i) ? "" : line).join("\n");
};

const validateBody = (md, text, skillPath) => {
  const prose = bodyProse(text);
  for (const line of prose.split("\n"))
    if (/^\s*(?:Done when\s+)?<[^>]+>\s*$/.test(line))
      warnings.push(`${rel(md)}: [template-slot] unfilled template slot: ${line.trim()}`);
  const headings = [...prose.matchAll(/^ {0,3}(#{1,6})\s+(.+)$/gm)];
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    if (!/^#{2,3}$/.test(heading[1]) || !/^\d+\.\s/.test(heading[2])) continue;
    const next = headings.slice(i + 1).find((h) => h[1].length <= heading[1].length);
    const section = prose.slice(heading.index + heading[0].length, next?.index ?? prose.length);
    if (!/^Done when\b/m.test(section))
      warnings.push(`${rel(md)}: [step-done-when] ${heading[0].trim()} has no Done when line`);
  }

  // shortcut: sentence boundaries use punctuation and Markdown blocks, refine if real prose needs a language parser.
  const paragraphs = prose.replace(/^ {0,3}#{1,6}\s+.*$/gm, "")
    .replace(/^\s*(?:[-*+] |\d+\. )/gm, "\n").split(/\n\s*\n/);
  for (const paragraph of paragraphs)
    for (const sentence of paragraph.trim().split(/[.!?]+["'’”*_)\]]*(?:\s+|$)/).filter(Boolean)) {
      const words = sentence.trim().split(/\s+/).filter(Boolean).length;
      if ((/(?:^|:)\s*repeat\b/i.test(sentence) || (/\buntil\b/i.test(sentence) && /\b(?:repeat|retry|rerun|re-run|poll|wait|keep|loop|iterate)\b/i.test(sentence))) && !/\d/.test(sentence))
        warnings.push(`${rel(md)}: [bounded-loop] until/repeat sentence has no digit: ${sentence.trim().replace(/\s+/g, " ")}`);
      if (words > SENTENCE_MAX_WORDS)
        warnings.push(`${rel(md)}: [sentence-length] sentence has ${words} words (max ${SENTENCE_MAX_WORDS}): ${sentence.trim().replace(/\s+/g, " ")}`);
    }

  if (fs.existsSync(path.join(skillPath, "references", "harness-notes.md")))
    for (const hit of prose.matchAll(/\b(?:Claude Code|Codex|AskUserQuestion)\b/g))
      warnings.push(`${rel(md)}: [harness-name] ${hit[0]} belongs in references/harness-notes.md`);
};

const readFrontmatter = (fmBlock) => {
  const name = fmBlock.match(/^name:\s*(\S+)\s*$/m)?.[1]?.replace(/^["']|["']$/g, "");
  let description = fmBlock.match(/^description:\s*(.*)$/m)?.[1]?.trim();
  if (/^[>|][-+]?$/.test(description ?? "")) {
    // folded/literal block scalar: the value is the indented lines that follow
    const after = fmBlock.slice(fmBlock.indexOf("description:")).split("\n").slice(1);
    const lines = [];
    for (const line of after) {
      if (!/^\s+\S/.test(line)) break;
      lines.push(line.trim());
    }
    description = lines.join(" ");
  }
  return { name, description: description?.replace(/^["']|["']$/g, "") };
};

const validateDescription = (md, d, fmBlock) => {
  if (d.length > DESCRIPTION_MAX_CHARS)
    errors.push(`${rel(md)}: description is ${d.length} chars (max ${DESCRIPTION_MAX_CHARS})`);
  if (/^<[^>]+>$/.test(d)) errors.push(`${rel(md)}: [template-slot] unfilled template slot in description`);
  else if (/<[a-z][^>]*>/i.test(d)) errors.push(`${rel(md)}: description contains an XML tag`);

  // A hand-invoked skill is not discovered from its description.
  if (/^disable-model-invocation:\s*true\s*$/m.test(fmBlock)) return;
  if (d.length < DESCRIPTION_MIN_GOOD)
    warnings.push(`${rel(md)}: description is ${d.length} chars — too short to carry identity plus triggers (aim ${DESCRIPTION_MIN_GOOD}-${DESCRIPTION_MAX_GOOD})`);
  else if (d.length > DESCRIPTION_MAX_GOOD)
    warnings.push(`${rel(md)}: description is ${d.length} chars — it has started summarising the body (aim ${DESCRIPTION_MIN_GOOD}-${DESCRIPTION_MAX_GOOD})`);
  if (!/\b(use when|use this when|trigger)/i.test(d))
    warnings.push(`${rel(md)}: description states no trigger ("Use when …") — agents cannot tell when to load it`);
  if (/\b(I can|I will|you can use this|you should use)\b/i.test(d))
    warnings.push(`${rel(md)}: description is not third person — mixed point-of-view degrades matching`);
};

// Resolve relative links from the markdown file's folder.
const validateLinks = (mdPath) => {
  const text = stripCode(fs.readFileSync(mdPath, "utf8"));
  const links = [
    ...text.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\s*\)/g),
    ...text.matchAll(/^ {0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm),
  ];
  for (const m of links) {
    const target = m[1] ?? m[2];
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) continue; // URL, anchor, absolute path
    const file = decodeURIComponent(target.split("#")[0]);
    if (!fs.existsSync(path.resolve(path.dirname(mdPath), file)))
      errors.push(`${rel(mdPath)}: links to ${target}, which does not exist`);
  }
};

const walkFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walkFiles(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );

const validateSkill = (skillPath, folderName) => {
  const md = path.join(skillPath, "SKILL.md");
  if (skillNames.has(folderName))
    errors.push(`${rel(md)}: duplicate skill name "${folderName}" across categories`);
  skillNames.add(folderName);
  skillPaths.add(path.relative(skillsDir, skillPath));
  const text = fs.readFileSync(md, "utf8");
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) {
    errors.push(`${rel(md)}: missing YAML frontmatter`);
  } else {
    const { name, description } = readFrontmatter(fm[1]);
    if (name !== folderName)
      errors.push(`${rel(md)}: frontmatter name "${name}" != folder name "${folderName}"`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(folderName))
      errors.push(`${rel(md)}: name "${folderName}" must be lowercase letters, digits and single hyphens`);
    if (folderName.length > NAME_MAX_CHARS)
      errors.push(`${rel(md)}: name is ${folderName.length} chars (max ${NAME_MAX_CHARS})`);
    if (/anthropic|claude/i.test(folderName))
      errors.push(`${rel(md)}: name contains the reserved word "anthropic" or "claude"`);
    if (!description) errors.push(`${rel(md)}: missing or empty description`);
    else validateDescription(md, description, fm[1]);
  }

  validateBody(md, text, skillPath);

  const lines = countLines(text);
  if (lines > SKILL_MD_MAX_LINES)
    warnings.push(`${rel(md)}: ${lines} lines (soft ceiling ${SKILL_MD_MAX_LINES}) — push run-specific material to references/ or prune`);

  for (const file of walkFiles(skillPath)) {
    if (file.endsWith(".md")) validateLinks(file);
  }

  // A reference reached only through another reference gets partially read.
  const refsDir = path.join(skillPath, "references");
  if (fs.existsSync(refsDir))
    for (const ref of fs.readdirSync(refsDir))
      if (ref.endsWith(".md") && !text.includes(`references/${ref}`))
        warnings.push(`${rel(path.join(refsDir, ref))}: not linked from SKILL.md`);
};

for (const p of [path.join(repoRoot, "SKILL.md"), path.join(skillsDir, "SKILL.md")])
  if (fs.existsSync(p)) errors.push(`${rel(p)} shadows every skill in the repo`);

for (const doc of ["AGENTS.md", "README.md"]) {
  const file = path.join(repoRoot, doc);
  if (fs.existsSync(file)) validateLinks(file);
}

if (!fs.existsSync(skillsDir)) errors.push("skills/: missing directory");
for (const category of fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir, { withFileTypes: true }) : []) {
  if (!category.isDirectory()) continue;
  const categoryPath = path.join(skillsDir, category.name);
  if (!CATEGORY.test(category.name))
    errors.push(`${rel(categoryPath)}: category must be lowercase letters and single hyphens`);
  for (const file of walkFiles(categoryPath)) {
    if (path.basename(file) !== "SKILL.md") continue;
    const depth = path.relative(skillsDir, path.dirname(file)).split(path.sep).length;
    if (depth === 1) errors.push(`${rel(file)} shadows every skill in the category`);
    else if (depth > 2) errors.push(`${rel(file)}: skill is deeper than skills/<category>/<name>/`);
  }
  for (const e of fs.readdirSync(categoryPath, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const skillPath = path.join(categoryPath, e.name);
    if (!fs.existsSync(path.join(skillPath, "SKILL.md"))) {
      warnings.push(`${rel(skillPath)} has no SKILL.md`);
      continue;
    }
    skillCategories.add(category.name);
    validateSkill(skillPath, e.name);
  }
}

if (fs.existsSync(evalsDir)) {
  for (const category of fs.readdirSync(evalsDir, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    const categoryPath = path.join(evalsDir, category.name);
    if (!CATEGORY.test(category.name))
      errors.push(`${rel(categoryPath)}: category must be lowercase letters and single hyphens`);
    for (const e of fs.readdirSync(categoryPath, { withFileTypes: true })) {
      if (e.isDirectory() && !skillPaths.has(path.join(category.name, e.name)))
        errors.push(`${rel(path.join(categoryPath, e.name))} matches no skill in the same category under skills/`);
    }
  }
}

// Local paths leak a username or session id into a public repo; the listed names are fixture fakes.
const FIXTURE_NAMES = "jdoe|jdoe-noreply|alice|alice\\.meyer|user|user-admin|runner\\.dev";
const LOCAL_PATH = new RegExp(
  String.raw`(?:/(?:home|Users)/|\b[A-Za-z]:\\+[Uu][Ss][Ee][Rr][Ss]\\+)(?!(?:${FIXTURE_NAMES})(?![\w.-]))[\w.-]+|/tmp/claude-\d+/-`,
);
for (const dir of [skillsDir, evalsDir].filter(fs.existsSync))
  for (const file of walkFiles(dir)) {
    if (/^evals\/(?:.*\/)?results\//.test(rel(file))) continue; // gitignored eval run output
    const hit = fs.readFileSync(file, "utf8").match(LOCAL_PATH);
    if (hit) errors.push(`${rel(file)}: local path "${hit[0]}"; use a placeholder like <scratch> or /home/<user>`);
  }

// Claude plugin manifests: the plugin's skill scan is not recursive, so each category needs an entry.
const pluginDir = path.join(repoRoot, ".claude-plugin");
const readJson = (file) => {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    errors.push(`${rel(file)}: invalid JSON (${err.message})`);
    return null;
  }
};
const NO_VERSION = `remove "version"; the commit SHA is the plugin version (see AGENTS.md Conventions)`;
const RESERVED_PREFIX =/^(claude-|anthropic-|cc-plugin-)/;
const checkName = (file, what, name) => {
  if (typeof name !== "string" || !name) errors.push(`${rel(file)}: missing ${what} name`);
  else if (RESERVED_PREFIX.test(name))
    errors.push(`${rel(file)}: ${what} name "${name}" starts with a reserved prefix (claude-, anthropic-, cc-plugin-)`);
};
const pluginFile = path.join(pluginDir, "plugin.json");
const marketFile = path.join(pluginDir, "marketplace.json");
if (fs.existsSync(pluginDir))
  for (const file of [pluginFile, marketFile]) if (!fs.existsSync(file)) errors.push(`${rel(file)}: missing`);
const plugin = readJson(pluginFile);
const market = readJson(marketFile);
if (plugin) {
  checkName(pluginFile, "plugin", plugin.name);
  const listed = (Array.isArray(plugin.skills) ? plugin.skills : [plugin.skills ?? ""]).map((s) =>
    path.posix.normalize(String(s)).replace(/\/$/, ""),
  );
  const expected = [...skillCategories].map((c) => `skills/${c}`);
  const missing = expected.filter((d) => !listed.includes(d));
  const extra = listed.filter((d) => !expected.includes(d));
  if ("version" in plugin) errors.push(`${rel(pluginFile)}: ${NO_VERSION}`);
  if (missing.length || extra.length || listed.length !== new Set(listed).size)
    errors.push(`${rel(pluginFile)}: "skills" must list each category folder that holds skills once` +
      (missing.length ? `; missing ${missing.map((d) => `./${d}`).join(", ")}` : "") +
      (extra.length ? `; not a skill category: ${extra.join(", ")}` : ""));
}
if (market) {
  checkName(marketFile, "marketplace", market.name);
  const entries = Array.isArray(market.plugins) ? market.plugins : [];
  for (const entry of entries) {
    checkName(marketFile, "plugin entry", entry?.name);
    if (entry && typeof entry === "object" && "version" in entry)
      errors.push(`${rel(marketFile)}: plugin entry "${entry.name}": ${NO_VERSION}`);
  }
  if (plugin && !entries.some((entry) => entry?.name === plugin.name))
    errors.push(`${rel(marketFile)}: no plugin entry named "${plugin.name}" (the name in plugin.json)`);
}

// Codex plugin manifests: Codex scans "./skills/" recursively, so one root entry covers every category.
const codexPluginFile = path.join(repoRoot, ".codex-plugin", "plugin.json");
const codexMarketFile = path.join(repoRoot, ".agents", "plugins", "marketplace.json");
if ([codexPluginFile, codexMarketFile].some(fs.existsSync))
  for (const file of [codexPluginFile, codexMarketFile]) if (!fs.existsSync(file)) errors.push(`${rel(file)}: missing`);
const codexPlugin = readJson(codexPluginFile);
const codexMarket = readJson(codexMarketFile);
if (codexPlugin) {
  checkName(codexPluginFile, "plugin", codexPlugin.name);
  if (plugin && codexPlugin.name !== plugin.name)
    errors.push(`${rel(codexPluginFile)}: name "${codexPlugin.name}" differs from ${rel(pluginFile)} name "${plugin.name}"`);
  const listed = (Array.isArray(codexPlugin.skills) ? codexPlugin.skills : [codexPlugin.skills ?? ""]).map((s) =>
    path.posix.normalize(String(s)).replace(/\/$/, ""),
  );
  const missing = listed.includes("skills") ? [] : [...skillCategories].filter((c) => !listed.includes(`skills/${c}`));
  if (missing.length)
    errors.push(`${rel(codexPluginFile)}: "skills" must be "./skills/" or list every category; missing ${missing.map((c) => `./skills/${c}`).join(", ")}`);
}
if (codexMarket) {
  checkName(codexMarketFile, "marketplace", codexMarket.name);
  const entries = Array.isArray(codexMarket.plugins) ? codexMarket.plugins : [];
  if (codexPlugin && !entries.some((entry) => entry?.name === codexPlugin.name))
    errors.push(`${rel(codexMarketFile)}: no plugin entry named "${codexPlugin.name}" (the name in .codex-plugin/plugin.json)`);
}

for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`\n${skillPaths.size} skill(s) checked: ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
