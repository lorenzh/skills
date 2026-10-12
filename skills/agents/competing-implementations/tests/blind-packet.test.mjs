import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { exportPacket, redact } from "../scripts/blind-packet.mjs";

test("literal identities are redacted case-insensitively, longest first", () => {
  assert.equal(redact("m1+high /work/m1 M1 [vendor]", ["m1", "m1+high", "/work/m1", "[vendor]"]),
    "[redacted] [redacted] [redacted] [redacted]");
  assert.equal(redact("text", []), "text");
});

test("vendor/model backstop works with an empty deny file", () => {
  const identities = "Claude ANTHROPIC Opus Sonnet Haiku gpt-6.1-sol OpenAI Codex Gemini Llama Mistral o1-mini o3-pro o4-mini";
  assert.equal(redact(identities, []), Array(14).fill("[redacted]").join(" "));
  assert.equal(redact("gpt-6.1-sol private-branch", ["private-branch"]), "[redacted] [redacted]");
});

test("disabling built-in patterns preserves ordinary text and redacts deny literals", () => {
  const text = "Claude gpt-6.1-sol private-branch";
  assert.equal(redact(text, ["private-branch"], { builtinPatterns: false }),
    "Claude gpt-6.1-sol [redacted]");
  assert.equal(redact(text, [], { builtinPatterns: false }), text);
});

test("CLI toggles built-in patterns for diffs and checks and rejects unknown options", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "competition-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, "candidate"); fs.mkdirSync(repo);
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  fs.writeFileSync(path.join(repo, "tools.txt"), "old\n");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "base");
  const text = "Claude gpt-6.1-sol private-branch\n";
  fs.writeFileSync(path.join(repo, "tools.txt"), text);
  const checks = path.join(root, "checks.txt"), deny = path.join(root, "deny.txt");
  fs.writeFileSync(checks, text);
  fs.writeFileSync(deny, "private-branch\n");
  const script = new URL("../scripts/blind-packet.mjs", import.meta.url);
  for (const builtinPatterns of [true, false]) {
    const destination = path.join(root, String(builtinPatterns));
    const args = [script.pathname, repo, "HEAD", checks, deny, destination, "--json"];
    if (!builtinPatterns) args.push("--no-builtin-patterns");
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).files.length, 2);
    const expected = builtinPatterns ? "[redacted] [redacted] [redacted]" : "Claude gpt-6.1-sol [redacted]";
    for (const file of ["diff.txt", "checks.txt"]) {
      const output = fs.readFileSync(path.join(destination, file), "utf8");
      assert.ok(output.includes(expected), output);
      assert.doesNotMatch(output, /private-branch/);
    }
  }
  const destination = path.join(root, "unknown");
  const result = spawnSync(process.execPath,
    [script.pathname, repo, "HEAD", checks, deny, destination, "--no-builtin-patterns", "--unknown"],
    { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
  assert.equal(fs.existsSync(destination), false);
});

test("AI-tool export preserves model content after runtime lines are removed at the source", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "competition-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, "candidate"); fs.mkdirSync(repo);
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  fs.writeFileSync(path.join(repo, "CLAUDE.md"), "old\n");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "base");
  fs.writeFileSync(path.join(repo, "CLAUDE.md"), "Supported models: gpt-6.1-sol and ollama\n");
  const checks = path.join(root, "checks.txt"), deny = path.join(root, "deny.txt");
  fs.writeFileSync(checks,
    `OpenAI Codex runtime banner: gpt-6.1-sol\nmodel: gpt-6.1-sol\nsession: private-session\nworkdir: ${repo}\n` +
    "Command: check-model gpt-6.1-sol\nExit: 1\nFAIL gpt-6.1-sol docs on private-branch\n");
  // The orchestrator removes known runtime lines before export, not model names from repository content.
  const prepared = fs.readFileSync(checks, "utf8").split("\n")
    .filter((line) => !/^(OpenAI Codex runtime banner:|model:|session:|workdir:)/.test(line)).join("\n");
  fs.writeFileSync(checks, prepared);
  fs.writeFileSync(deny, `${repo}\nprivate-branch\n`);
  const destination = path.join(root, "A");
  const result = spawnSync(process.execPath,
    [new URL("../scripts/blind-packet.mjs", import.meta.url).pathname,
      repo, "HEAD", checks, deny, destination, "--no-builtin-patterns"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const diff = fs.readFileSync(path.join(destination, "diff.txt"), "utf8");
  assert.match(diff, /diff --git a\/CLAUDE\.md b\/CLAUDE\.md/);
  assert.match(diff, /\+Supported models: gpt-6\.1-sol and ollama/);
  const output = fs.readFileSync(path.join(destination, "checks.txt"), "utf8");
  assert.equal(output, "Command: check-model gpt-6.1-sol\nExit: 1\nFAIL gpt-6.1-sol docs on [redacted]\n");
  assert.doesNotMatch(output, /runtime banner|model:|session:|workdir:|private-session|private-branch/);
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
  fs.rmSync(path.join(repo, "asset.bin"));
  git("reset", "--", "asset.bin");
  fs.writeFileSync(deny, "");
  fs.writeFileSync(checks, "Command: codex check\nExit: 0\n");
  const emptyDenyDestination = path.join(root, "empty-deny");
  exportPacket(repo, base, checks, deny, emptyDenyDestination);
  assert.equal(fs.readFileSync(path.join(emptyDenyDestination, "checks.txt"), "utf8"), "Command: [redacted] check\nExit: 0\n");
  assert.equal(git("rev-parse", "HEAD"), base);
});
