import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { exportPacket, redact } from "../scripts/blind-packet.mjs";

test("literal identities are redacted case-insensitively, longest first", () => {
  assert.equal(redact("m1+high /work/m1 M1 [vendor]", ["m1", "m1+high", "/work/m1", "[vendor]"]),
    "[redacted] [redacted] [redacted] [redacted]");
  assert.throws(() => redact("text", []), /Populate/);
});

test("exports staged, unstaged and new code, preserving failed check evidence", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "competition-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, "candidate"); fs.mkdirSync(repo);
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  fs.writeFileSync(path.join(repo, "cache.txt"), "old\n");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "participant identity in commit");
  const base = git("rev-parse", "HEAD");
  fs.writeFileSync(path.join(repo, "cache.txt"), "staged\n"); git("add", ".");
  fs.appendFileSync(path.join(repo, "cache.txt"), "unstaged m1\n");
  fs.writeFileSync(path.join(repo, "edge.txt"), "negative TTL\n");
  const checks = path.join(root, "checks.txt"), deny = path.join(root, "deny.txt");
  fs.writeFileSync(checks, "m1 branch compete/task-one\nCommand: npm test\nExit: 1\nFAIL negative TTL\n");
  fs.writeFileSync(deny, "m1\ncompete/task-one\n");
  const destination = path.join(root, "A");
  assert.throws(() => exportPacket(repo, base, checks, deny, destination), /Include new files/);
  assert.equal(fs.existsSync(destination), false);
  git("add", "-N", "edge.txt");
  exportPacket(repo, base, checks, deny, destination);
  const diff = fs.readFileSync(path.join(destination, "diff.txt"), "utf8");
  assert.match(diff, /staged/); assert.match(diff, /unstaged/); assert.match(diff, /negative TTL/);
  assert.doesNotMatch(diff, /m1|participant identity/);
  assert.match(fs.readFileSync(path.join(destination, "checks.txt"), "utf8"), /Exit: 1\nFAIL negative TTL/);
  assert.throws(() => exportPacket(repo, base, checks, deny, destination), /EEXIST/);
  fs.writeFileSync(path.join(repo, "asset.bin"), Buffer.from("hidden m1\0identity"));
  git("add", "-N", "asset.bin");
  const binaryDestination = path.join(root, "binary");
  assert.throws(() => exportPacket(repo, base, checks, deny, binaryDestination), /Binary changes/);
  assert.equal(fs.existsSync(binaryDestination), false);
  assert.equal(git("rev-parse", "HEAD"), base);
});
