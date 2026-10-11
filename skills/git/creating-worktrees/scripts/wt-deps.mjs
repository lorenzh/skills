#!/usr/bin/env node
// Dependency state of a git worktree: what to install, whether the lockfile changed
// since the last install, and whether imports resolve inside the worktree.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const USAGE = `Usage: node wt-deps.mjs <check|mark|resolve> [worktree] [--json]

  check    Per ecosystem: lockfile hash in the worktree and in the main checkout,
           and the action: install, reinstall (lockfile changed since the marker),
           ok, or cache (global cache; the build fetches what it needs).
  mark     Record the current lockfile hashes as installed (run after installing).
           The marker lives in the worktree's git dir, never in the work tree.
  resolve  Resolve each dependency in package.json from the worktree and report
           any that resolve outside it (for example to the main checkout).

worktree defaults to the current directory. Pass a subdirectory to check a nested
project (for example packages/app); the main checkout's same subdirectory is compared.

Exit 0  nothing to do / all resolve inside the worktree / marker written
Exit 1  action needed: an install, a reinstall, or a dependency resolving outside
Exit 2  misuse: unknown command, or the path is not a git work tree`;

// [lockfile, ecosystem, install command, per-worktree dependency dir or null]
const LOCKFILES = [
  ["npm-shrinkwrap.json", "npm", "npm ci --prefer-offline", "node_modules"],
  ["package-lock.json", "npm", "npm ci --prefer-offline", "node_modules"],
  ["pnpm-lock.yaml", "pnpm", "pnpm install --frozen-lockfile --prefer-offline", "node_modules"],
  ["yarn.lock", "yarn", "yarn install --immutable", "node_modules"],
  ["bun.lock", "bun", "bun install --frozen-lockfile", "node_modules"],
  ["bun.lockb", "bun", "bun install --frozen-lockfile", "node_modules"],
  ["uv.lock", "uv", "uv sync --frozen", ".venv"],
  ["poetry.lock", "poetry", "poetry install --sync", null],
  ["Pipfile.lock", "pipenv", "pipenv sync", null],
  ["Gemfile.lock", "bundler", "bundle install", null],
  ["composer.lock", "composer", "composer install", "vendor"],
  ["go.sum", "go", "go mod download", null],
  ["Cargo.lock", "cargo", "cargo fetch", null],
  ["packages.lock.json", "nuget", "dotnet restore", null],
  ["gradle.lockfile", "gradle", "./gradlew dependencies", null],
  ["pom.xml", "maven", "mvn dependency:go-offline", null],
];
const MARKER = "creating-worktrees.json";

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function hash(file) {
  try {
    return createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}

function context(dir) {
  const root = git(dir, "rev-parse", "--show-toplevel");
  const gitDir = path.resolve(root, git(root, "rev-parse", "--git-dir"));
  // The first entry of `git worktree list` is the main checkout.
  const mainRoot = git(root, "worktree", "list", "--porcelain").split("\n")[0].replace(/^worktree /, "");
  const rel = path.relative(fs.realpathSync(root), fs.realpathSync(dir));
  return { root: path.join(root, rel), main: path.join(mainRoot, rel), marker: path.join(gitDir, MARKER) };
}

function readMarker(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).lockfiles ?? {};
  } catch {
    return {};
  }
}

function check({ root, main, marker }) {
  const installed = readMarker(marker);
  const items = [];
  for (const [lock, eco, cmd, depDir] of LOCKFILES) {
    const here = hash(path.join(root, lock));
    if (!here) continue;
    // npm ignores package-lock.json when npm-shrinkwrap.json exists.
    if (lock === "package-lock.json" && fs.existsSync(path.join(root, "npm-shrinkwrap.json"))) continue;
    const inMain = root === main ? here : hash(path.join(main, lock));
    let action;
    if (!depDir && !["poetry", "pipenv", "bundler"].includes(eco)) action = "cache";
    else if (depDir && !fs.existsSync(path.join(root, depDir)) && !(eco === "yarn" && fs.existsSync(path.join(root, ".pnp.cjs")))) action = "install";
    else if (!installed[lock]) action = depDir ? "reinstall" : "install";
    else action = installed[lock] === here ? "ok" : "reinstall";
    items.push({ ecosystem: eco, lockfile: lock, hash: here, mainHash: inMain, sameAsMain: here === inMain, action, command: cmd });
  }
  return items;
}

// Finds each dependency the way Node's lookup does: node_modules/<name> in the project
// directory, then in every parent. Independent of a package's exports map.
function resolve(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const real = fs.realpathSync(root) + path.sep;
  const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies });
  return names.map((name) => {
    let where = null;
    for (let dir = root; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, "node_modules", name);
      if (fs.existsSync(candidate)) {
        where = fs.realpathSync(candidate);
        break;
      }
      if (dir === path.dirname(dir)) break;
    }
    // A file: or workspace dependency may resolve to tracked source inside the worktree.
    return { name, path: where, inside: where !== null && (where + path.sep).startsWith(real) };
  });
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}
const json = args.includes("--json");
const [cmd, dir = "."] = args.filter((a) => a !== "--json");
if (!["check", "mark", "resolve"].includes(cmd)) {
  console.error(USAGE);
  process.exit(2);
}
let ctx;
try {
  ctx = context(path.resolve(dir));
} catch {
  console.error(`${path.resolve(dir)} is not inside a git work tree. Pass the worktree path.`);
  process.exit(2);
}

if (cmd === "check") {
  const items = check(ctx);
  const todo = items.filter((i) => i.action === "install" || i.action === "reinstall");
  if (json) console.log(JSON.stringify({ worktree: ctx.root, main: ctx.main, items }, null, 2));
  else if (!items.length) console.log("No lockfile found: nothing to install.");
  else
    for (const i of items) {
      const vs = i.sameAsMain ? "same lockfile as main" : i.mainHash ? "lockfile differs from main" : "main has no such lockfile";
      const what = { install: `install: ${i.command}`, reinstall: `lockfile changed since last install: ${i.command}`, ok: "ok, installed for this lockfile", cache: `global cache, nothing to copy (${i.command} if offline later)` }[i.action];
      console.log(`${i.ecosystem} (${i.lockfile}, ${vs}): ${what}`);
    }
  process.exit(todo.length ? 1 : 0);
}

if (cmd === "mark") {
  const lockfiles = Object.fromEntries(check(ctx).map((i) => [i.lockfile, i.hash]));
  fs.writeFileSync(ctx.marker, `${JSON.stringify({ lockfiles, at: new Date().toISOString() }, null, 2)}\n`);
  console.log(json ? JSON.stringify({ marker: ctx.marker, lockfiles }) : `Marker written: ${ctx.marker}`);
  process.exit(0);
}

if (!fs.existsSync(path.join(ctx.root, "package.json"))) {
  console.log(json ? JSON.stringify({ worktree: ctx.root, results: [] }) : "No package.json here: nothing to resolve.");
  process.exit(0);
}
if (fs.existsSync(path.join(ctx.root, ".pnp.cjs"))) {
  console.log(json ? JSON.stringify({ worktree: ctx.root, pnp: true, results: [] }) : "Yarn Plug'n'Play: packages resolve through this worktree's .pnp.cjs.");
  process.exit(0);
}
let results;
try {
  results = resolve(ctx.root);
} catch (e) {
  console.error(`Cannot read ${path.join(ctx.root, "package.json")}: ${e.message}. Fix the file, then run resolve again.`);
  process.exit(1);
}
const outside = results.filter((r) => !r.inside);
if (json) console.log(JSON.stringify({ worktree: ctx.root, results }, null, 2));
else
  for (const r of outside)
    console.log(`${r.name} ${r.path ? `resolves outside the worktree: ${r.path}` : "is not installed"}. Install dependencies in the worktree.`);
process.exit(outside.length ? 1 : 0);
