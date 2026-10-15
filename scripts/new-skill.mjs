#!/usr/bin/env node
// Scaffolds skills/<category>/<name>/SKILL.md from the writing-skills template,
// filling {{name}} and {{title}}. --evals also copies templates/evals/ for tier 2.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `Usage: node scripts/new-skill.mjs <category>/<name> [--evals]

Creates skills/<category>/<name>/SKILL.md from
skills/agents/writing-skills/templates/SKILL.md.tmpl.
--evals also creates evals/<category>/<name>/evals.json from templates/evals/ (tier 2).
By default, no evals directory is created.
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
const withEvals = args.includes("--evals");
const positional = args.filter((arg) => arg !== "--evals");
const [category, name, extra] = (positional[0] ?? "").split("/");
if (positional.length !== 1 || args.length !== (withEvals ? 2 : 1) || extra !== undefined || !/^[a-z]+(-[a-z]+)*$/.test(category) || !name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64 || /anthropic|claude/.test(name)) {
  console.error(USAGE);
  process.exit(2);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const title = name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const targets = [
  [path.join(repoRoot, "skills", "agents", "writing-skills", "templates", "SKILL.md.tmpl"), path.join(repoRoot, "skills", category, name)],
  ...(withEvals ? [[path.join(repoRoot, "templates", "evals"), path.join(repoRoot, "evals", category, name)]] : []),
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

// Read the skeleton before creating any destination.
const skeleton = fs.readFileSync(targets[0][0], "utf8");
const fill = (text) => text.replaceAll("{{name}}", name).replaceAll("{{title}}", title);
const copy = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name.replace(/\.tmpl$/, ""));
    if (e.isDirectory()) copy(from, to);
    else fs.writeFileSync(to, fill(fs.readFileSync(from, "utf8")));
  }
};

for (const [src, dest] of targets) {
  if (src === targets[0][0]) {
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "SKILL.md"), fill(skeleton));
  } else copy(src, dest);
  console.log(`created ${path.relative(repoRoot, dest)}/`);
}
console.log(`\nNext: fill in the placeholders in skills/${category}/${name}/SKILL.md, then run node scripts/validate-skills.mjs`);
