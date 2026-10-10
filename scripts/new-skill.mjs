#!/usr/bin/env node
// Scaffolds a new skill: copies templates/skill/ to skills/<category>/<name>/ and
// templates/evals/ to evals/<category>/<name>/, filling in {{name}} and {{title}}.
// Template files end in .tmpl: when skills/ is empty the skills CLI searches the whole
// repo, finds templates/skill/SKILL.md, and prints a warning each run before skipping it
// ({{name}} parses as a YAML object, not a string).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `Usage: node scripts/new-skill.mjs <category>/<name>

Creates skills/<category>/<name>/SKILL.md and evals/<category>/<name>/evals.json from templates/.
<category> is lowercase letters and single hyphens.
<name> is lowercase letters, digits and hyphens, at most 64 characters,
and must not contain "anthropic" or "claude".

Exit 0  created
Exit 1  the skill or its evals directory already exists
Exit 2  missing or invalid category/name`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}
const [category, name, extra] = (args[0] ?? "").split("/");
if (args.length !== 1 || extra !== undefined || !/^[a-z]+(-[a-z]+)*$/.test(category) || !name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64 || /anthropic|claude/.test(name)) {
  console.error(USAGE);
  process.exit(2);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const title = name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const targets = [
  [path.join(repoRoot, "templates", "skill"), path.join(repoRoot, "skills", category, name)],
  [path.join(repoRoot, "templates", "evals"), path.join(repoRoot, "evals", category, name)],
];

const skillsDir = path.join(repoRoot, "skills");
if (fs.existsSync(skillsDir))
  for (const e of fs.readdirSync(skillsDir, { withFileTypes: true }))
    if (e.isDirectory() && fs.existsSync(path.join(skillsDir, e.name, name, "SKILL.md"))) {
      console.error(`skill "${name}" already exists in category "${e.name}" — pick another name`);
      process.exit(1);
    }

for (const [, dest] of targets)
  if (fs.existsSync(dest)) {
    console.error(`${path.relative(repoRoot, dest)} already exists — pick another name or edit it directly`);
    process.exit(1);
  }

const copy = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name.replace(/\.tmpl$/, ""));
    if (e.isDirectory()) copy(from, to);
    else fs.writeFileSync(to, fs.readFileSync(from, "utf8").replaceAll("{{name}}", name).replaceAll("{{title}}", title));
  }
};

for (const [src, dest] of targets) {
  copy(src, dest);
  console.log(`created ${path.relative(repoRoot, dest)}/`);
}
console.log(`\nNext: fill in the TODOs in skills/${category}/${name}/SKILL.md, then run node scripts/validate-skills.mjs`);
