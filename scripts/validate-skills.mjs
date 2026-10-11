#!/usr/bin/env node
// Errors (exit 1): missing frontmatter, name/folder mismatch, name not lowercase-hyphen,
//   name over 64 chars or holding "anthropic"/"claude", missing description,
//   description over 1024 chars or holding an XML tag, a relative link in AGENTS.md,
//   README.md or a skill's markdown pointing at a file that does not exist,
//   missing skills/, a SKILL.md at repo root or in
//   skills/ or a category (it shadows skills below it), invalid category names,
//   deeper skills, duplicate names, evals without a skill in the same category,
//   and, when .claude-plugin/ exists: missing or unreadable plugin.json or marketplace.json,
//   plugin.json "skills" not equal to the category folders that hold skills,
//   plugin name missing from marketplace.json, a plugin or marketplace name
//   starting with "claude-", "anthropic-" or "cc-plugin-".
// Warnings (exit 0): SKILL.md over its line ceiling, description outside the
//   120-700 char band, with no trigger, not third person, or still holding the
//   template's TODO, reference not linked from SKILL.md, skill folder without SKILL.md.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: node scripts/validate-skills.mjs

Validates skills/<category>/<name>/SKILL.md: layout, frontmatter, name rules, description
quality, that relative markdown links in skills, AGENTS.md and README.md resolve,
and that .claude-plugin/plugin.json and marketplace.json match the skill categories.

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
  if (/<[a-z][^>]*>/i.test(d)) errors.push(`${rel(md)}: description contains an XML tag`);
  if (/\bTODO\b/.test(d)) warnings.push(`${rel(md)}: description still holds the template's TODO`);

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
const RESERVED_PREFIX = /^(claude-|anthropic-|cc-plugin-)/;
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
  if (missing.length || extra.length || listed.length !== new Set(listed).size)
    errors.push(`${rel(pluginFile)}: "skills" must list each category folder that holds skills once` +
      (missing.length ? `; missing ${missing.map((d) => `./${d}`).join(", ")}` : "") +
      (extra.length ? `; not a skill category: ${extra.join(", ")}` : ""));
}
if (market) {
  checkName(marketFile, "marketplace", market.name);
  const entries = Array.isArray(market.plugins) ? market.plugins : [];
  for (const entry of entries) checkName(marketFile, "plugin entry", entry?.name);
  if (plugin && !entries.some((entry) => entry?.name === plugin.name))
    errors.push(`${rel(marketFile)}: no plugin entry named "${plugin.name}" (the name in plugin.json)`);
}

for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`\n${skillPaths.size} skill(s) checked: ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
