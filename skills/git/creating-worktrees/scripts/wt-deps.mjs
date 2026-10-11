#!/usr/bin/env node
// Dependency state of a git worktree: what to install, whether the lockfile changed
// since the last install, and whether imports resolve inside the worktree.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const USAGE = `Usage: node wt-deps.mjs <check|mark|resolve> [worktree] [--json]

Finds every project in the worktree by its tracked lockfiles and package.json files,
including nested ones (packages/app).

  check    Per lockfile: its hash in the worktree and in the main checkout, and the
           action: install, reinstall (lockfile changed since the marker), ok,
           verify (Poetry, Pipenv, Bundler keep their environment outside the
           worktree: run the idempotent command), or cache (global cache; the build
           fetches what it needs).
  mark     Record the current lockfile hashes as installed (run after installing).
           The marker lives in the worktree's git dir, never in the work tree.
  resolve  Locate each dependency of every package.json and report any that is
           missing or whose real path lies outside the worktree (for example in the
           main checkout). Missing optionalDependencies are allowed. With Yarn
           Plug'n'Play, resolves through the worktree's .pnp.cjs.

worktree defaults to the current directory.

Exit 0  nothing to do / all resolve inside the worktree / marker written
Exit 1  action needed: an install, a reinstall, a missing or outside dependency, or
        an unreadable package.json
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

const shellQuote = (s) => `'${s.replaceAll("'", "'\\''")}'`;

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
  const main = git(root, "worktree", "list", "--porcelain").split("\n")[0].replace(/^worktree /, "");
  const files = git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0").filter(Boolean);
  return { root, main, marker: path.join(gitDir, MARKER), files };
}

function readMarker(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).lockfiles ?? {};
  } catch {
    return {};
  }
}

function check({ root, main, marker, files }) {
  const installed = readMarker(marker);
  const items = [];
  for (const rel of files) {
    const entry = LOCKFILES.find(([lock]) => lock === path.basename(rel));
    if (!entry) continue;
    const [, eco, cmd, depDir] = entry;
    const dir = path.join(root, path.dirname(rel));
    // npm ignores package-lock.json when npm-shrinkwrap.json exists.
    if (entry[0] === "package-lock.json" && fs.existsSync(path.join(dir, "npm-shrinkwrap.json"))) continue;
    const here = hash(path.join(root, rel));
    if (!here) continue;
    const inMain = hash(path.join(main, rel));
    let action;
    if (["poetry", "pipenv", "bundler"].includes(eco)) action = "verify";
    else if (!depDir) action = "cache";
    else if (!fs.existsSync(path.join(dir, depDir)) && !(eco === "yarn" && fs.existsSync(path.join(dir, ".pnp.cjs")))) action = "install";
    else action = installed[rel] === here ? "ok" : "reinstall";
    items.push({ ecosystem: eco, lockfile: rel, hash: here, mainHash: inMain, sameAsMain: here === inMain, action, command: path.dirname(rel) === "." ? cmd : `cd -- ${shellQuote(path.dirname(rel))} && ${cmd}` });
  }
  return items;
}

// Locates each dependency the way Node's lookup does: node_modules/<name> in the
// project directory, then in every parent. Independent of a package's exports map.
function locate(projectDir, name) {
  for (let dir = projectDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(candidate)) return fs.realpathSync(candidate);
    if (dir === path.dirname(dir)) return null;
  }
}

// The nearest .pnp.cjs from the project directory up to the checkout root, loaded once.
function pnpFor(projectDir, root, cache) {
  for (let dir = projectDir; ; dir = path.dirname(dir)) {
    const file = path.join(dir, ".pnp.cjs");
    if (fs.existsSync(file)) {
      if (!cache.has(file)) cache.set(file, createRequire(file)(file));
      return cache.get(file);
    }
    if (dir === root || dir === path.dirname(dir)) return null;
  }
}

// Plug'n'Play maps a package into a zip in the Yarn cache (or an unplugged folder);
// the package is available only if that file exists.
function pnpLocate(pnp, name, projectDir) {
  try {
    const where = pnp.resolveToUnqualified(name, `${projectDir}/`);
    const zip = where?.match(/^(.*?\.zip)(?:[\\/]|$)/);
    return where && fs.existsSync(zip ? zip[1] : where) ? where : null;
  } catch {
    return null;
  }
}

function resolve({ root, files }) {
  const real = fs.realpathSync(root) + path.sep;
  const loaders = new Map();
  const results = [];
  for (const rel of files.filter((f) => path.basename(f) === "package.json" && !f.includes("node_modules/"))) {
    const projectDir = path.join(root, path.dirname(rel));
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
    } catch (e) {
      results.push({ project: rel, error: `cannot read ${rel}: ${e.message}` });
      continue;
    }
    const pnp = pnpFor(projectDir, root, loaders);
    const optional = new Set(Object.keys(pkg.optionalDependencies ?? {}));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies })) {
      const where = pnp ? pnpLocate(pnp, name, projectDir) : locate(projectDir, name);
      if (where === null && optional.has(name)) continue;
      // Plug'n'Play packages live in the Yarn cache; the worktree's own loader is the isolation.
      const inside = where !== null && (pnp !== null || `${where}${path.sep}`.startsWith(real));
      results.push({ project: rel, name, path: where, inside });
    }
  }
  return results;
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
      const what = { verify: `environment outside the worktree: run ${i.command}`, install: `install: ${i.command}`, reinstall: `lockfile changed since last install: ${i.command}`, ok: "ok, installed for this lockfile", cache: `global cache, nothing to copy (${i.command} if offline later)` }[i.action];
      console.log(`${i.ecosystem} (${i.lockfile}, ${vs}): ${what}`);
    }
  process.exit(todo.length ? 1 : 0);
}

if (cmd === "mark") {
  const lockfiles = { ...readMarker(ctx.marker), ...Object.fromEntries(check(ctx).map((i) => [i.lockfile, i.hash])) };
  fs.writeFileSync(ctx.marker, `${JSON.stringify({ lockfiles, at: new Date().toISOString() }, null, 2)}\n`);
  console.log(json ? JSON.stringify({ marker: ctx.marker, lockfiles }) : `Marker written: ${ctx.marker}`);
  process.exit(0);
}

let results;
try {
  results = resolve(ctx);
} catch (e) {
  console.error(`Cannot load a .pnp.cjs in ${ctx.root}: ${e.message}. Run the Yarn install, then resolve again.`);
  process.exit(1);
}
const bad = results.filter((r) => r.error || !r.inside);
if (json) console.log(JSON.stringify({ worktree: ctx.root, results }, null, 2));
else if (!results.length) console.log("No package.json found: nothing to resolve.");
else
  for (const r of bad)
    console.log(r.error ? `${r.error}. Fix the file, then run resolve again.` : `${r.project}: ${r.name} ${r.path ? `resolves outside the worktree: ${r.path}` : "is not installed"}. Install dependencies in the worktree.`);
process.exit(bad.length ? 1 : 0);
