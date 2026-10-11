import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/wt-deps.mjs");
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
const sh = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

// Main checkout with an installed dependency "pad"; branch `feat` gets a worktree.
function repo({ changeLock = false } = {}) {
  const main = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wt-deps-")));
  sh(main, "init", "-q", "-b", "main");
  sh(main, "config", "user.email", "t@t");
  sh(main, "config", "user.name", "t");
  write(path.join(main, "package.json"), JSON.stringify({ name: "app", dependencies: { pad: "1.0.0" } }));
  write(path.join(main, "package-lock.json"), '{"v":1}');
  write(path.join(main, ".gitignore"), "node_modules/\n.worktrees/\n");
  sh(main, "add", "-A");
  sh(main, "commit", "-qm", "init");
  sh(main, "branch", "feat");
  if (changeLock) {
    sh(main, "checkout", "-q", "feat");
    write(path.join(main, "package-lock.json"), '{"v":2}');
    sh(main, "commit", "-qam", "lock");
    sh(main, "checkout", "-q", "main");
  }
  write(path.join(main, "node_modules/pad/package.json"), '{"name":"pad","version":"1.0.0"}');
  write(path.join(main, "node_modules/pad/index.js"), "module.exports=1");
  const wt = path.join(main, ".worktrees/feat");
  sh(main, "worktree", "add", "-q", wt, "feat");
  return { main, wt };
}

test("--help exits 0, unknown command exits 2, non-repo exits 2", () => {
  assert.equal(run("--help").status, 0);
  assert.equal(run("nope").status, 2);
  assert.equal(run("check", os.tmpdir()).status, 2);
});

test("check: missing node_modules in a fresh worktree needs an install", () => {
  const { wt } = repo({ changeLock: true });
  const r = run("check", wt, "--json");
  assert.equal(r.status, 1);
  const [item] = JSON.parse(r.stdout).items;
  assert.equal(item.ecosystem, "npm");
  assert.equal(item.action, "install");
  assert.equal(item.sameAsMain, false);
});

test("resolve: without an install, pad resolves to the main checkout (upward resolution)", () => {
  const { main, wt } = repo();
  const r = run("resolve", wt, "--json");
  assert.equal(r.status, 1);
  const [pad] = JSON.parse(r.stdout).results;
  assert.ok(pad.path.startsWith(path.join(main, "node_modules")));
  assert.equal(pad.inside, false);
});

test("symlinked node_modules counts as outside the worktree", () => {
  const { main, wt } = repo();
  fs.symlinkSync(path.join(main, "node_modules"), path.join(wt, "node_modules"));
  assert.equal(run("resolve", wt).status, 1);
});

test("install, mark, then a lockfile change asks for a reinstall", () => {
  const { wt } = repo();
  fs.cpSync(path.join(path.dirname(wt), "../node_modules"), path.join(wt, "node_modules"), { recursive: true });
  assert.equal(run("resolve", wt).status, 0);
  assert.equal(JSON.parse(run("check", wt, "--json").stdout).items[0].action, "reinstall");
  const m = run("mark", wt, "--json");
  assert.equal(m.status, 0);
  assert.match(JSON.parse(m.stdout).marker, /\.git\/worktrees\/feat\/creating-worktrees\.json$/);
  assert.equal(run("check", wt).status, 0);
  write(path.join(wt, "package-lock.json"), '{"v":3}');
  const after = JSON.parse(run("check", wt, "--json").stdout).items[0];
  assert.equal(after.action, "reinstall");
});

test("global-cache ecosystems need nothing copied", () => {
  const { wt } = repo();
  fs.rmSync(path.join(wt, "package-lock.json"));
  write(path.join(wt, "go.sum"), "x");
  const r = run("check", wt, "--json");
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).items[0].action, "cache");
});

// Defects found in review.
test("an ESM-only package installed in the worktree resolves inside", () => {
  const { wt } = repo();
  write(path.join(wt, "node_modules/pad/package.json"), '{"name":"pad","exports":{"import":"./i.mjs"}}');
  assert.equal(run("resolve", wt).status, 0);
});

test("a nested project is checked in its own directory", () => {
  const { wt } = repo();
  write(path.join(wt, "packages/app/package.json"), '{"dependencies":{"lib":"1"}}');
  write(path.join(wt, "packages/app/package-lock.json"), "{}");
  assert.equal(run("resolve", path.join(wt, "packages/app")).status, 1);
  const item = JSON.parse(run("check", path.join(wt, "packages/app"), "--json").stdout).items[0];
  assert.equal(item.action, "install");
  assert.equal(item.mainHash, null);
});

test("npm-shrinkwrap.json takes precedence over package-lock.json", () => {
  const { wt } = repo();
  write(path.join(wt, "npm-shrinkwrap.json"), "{}");
  const items = JSON.parse(run("check", wt, "--json").stdout).items;
  assert.deepEqual(items.map((i) => i.lockfile), ["npm-shrinkwrap.json"]);
});

test("an unreadable package.json fails instead of passing", () => {
  const { wt } = repo();
  write(path.join(wt, "package.json"), "{oops");
  const r = run("resolve", wt);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Cannot read/);
});

test("Yarn Plug'n'Play counts as installed", () => {
  const { wt } = repo();
  fs.rmSync(path.join(wt, "package-lock.json"));
  write(path.join(wt, "yarn.lock"), "x");
  write(path.join(wt, ".pnp.cjs"), "");
  assert.equal(JSON.parse(run("check", wt, "--json").stdout).items[0].action, "reinstall");
  run("mark", wt);
  assert.equal(run("check", wt).status, 0);
  assert.equal(run("resolve", wt).status, 0);
});
