#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const usage = `Usage: node blind-packet.mjs <worktree> <base> <checks.txt> <deny.txt> <new-packet-dir> [--json]

Exports review-only diff.txt and checks.txt. The orchestrator assigns A/B via
packet directories. Deny file: one identity, vendor, branch or worktree path per
line. Include command and exit status for each check; omit commit metadata.
Inspect exported files manually before review. Redacted diffs are not patches.
Exit 0 exported; 1 blocked (fix reported issue); 2 invalid arguments.
`;

export function redact(text, terms) {
  const escaped = terms.filter(Boolean).sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const vendorModels = String.raw`claude|anthropic|opus|sonnet|haiku|gpt[-\w.]*|openai|codex|gemini|llama|mistral|o[134]-\w*`;
  return text.replace(new RegExp([...escaped, vendorModels].join("|"), "gi"), "[redacted]");
}

export function exportPacket(worktree, base, checksFile, denyFile, destination) {
  const git = (...args) => execFileSync("git", ["-C", worktree, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  const commit = git("rev-parse", "--verify", "--end-of-options", `${base}^{commit}`).trim();
  const status = git("status", "--porcelain", "--untracked-files=all");
  if (status.split("\n").some((line) => line.startsWith("?? ")))
    throw new Error("Include new files with git add or git add -N before exporting.");
  const terms = fs.readFileSync(denyFile, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const rawDiff = git("diff", "--no-color", "--no-ext-diff", "--no-textconv", "--binary", commit, "--");
  if (/^GIT binary patch$/m.test(rawDiff))
    throw new Error("Binary changes cannot be text-blinded; prepare separately reviewed anonymous evidence.");
  const diff = redact(rawDiff, terms);
  const checks = redact(fs.readFileSync(checksFile, "utf8"), terms);
  // Existing packets may contain stale identity-bearing files; require a fresh directory.
  fs.mkdirSync(destination);
  fs.writeFileSync(path.join(destination, "diff.txt"), diff);
  fs.writeFileSync(path.join(destination, "checks.txt"), checks);
  return { files: [path.join(destination, "diff.txt"), path.join(destination, "checks.txt")] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
  } else {
    const json = args.includes("--json");
    const positional = args.filter((arg) => arg !== "--json");
    if (positional.length !== 5 || positional.some((arg) => arg.startsWith("--"))) {
      console.error(usage);
      process.exitCode = 2;
    } else {
      try {
        const result = exportPacket(...positional);
        console.log(json ? JSON.stringify(result) : result.files.join("\n"));
      } catch (error) {
        const message = error.stderr?.toString().trim() || error.message;
        console.error(json ? JSON.stringify({ error: message }) : message);
        process.exitCode = 1;
      }
    }
  }
}
