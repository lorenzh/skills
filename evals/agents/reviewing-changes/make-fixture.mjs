#!/usr/bin/env node
// Builds a throwaway git repo for one eval case. Usage: make-fixture.mjs <case> <new-dir>
// Layout: <dir> is the repo (branch feat/x vs main). Untracked helper dirs are excluded from git:
//   .review/ (PR.md and the report), .claude/skills (added by run.mjs); the fake `gh` sits in <dir>-env/bin.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [name, dir] = process.argv.slice(2);
if (!name || !dir) { console.error("usage: make-fixture.mjs <case> <new-dir>"); process.exit(2); }
if (existsSync(dir) && readdirSync(dir).length) { console.error(`${dir} exists and is not empty`); process.exit(2); }
mkdirSync(dir, { recursive: true });
const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
const put = (path, text) => { const f = join(dir, path); mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, text); };

const base = {
  "package.json": JSON.stringify({ name: "tally", type: "module", scripts: { test: "node --test" } }, null, 2) + "\n",
  "AGENTS.md": "# AGENTS.md\n\nTiny utility library.\n\n## Rules\n\n- No default exports in `src/`. Use named exports.\n- Run `npm test` before every commit.\n",
  ".github/workflows/ci.yml": "name: CI\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n      - run: ./deploy.sh\n        if: github.ref == 'refs/heads/main'\n        env:\n          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}\n",
  "deploy.sh": "#!/bin/sh\ntouch DEPLOYED\n",
  "src/range.js": "export function sumTo(n) {\n  let s = 0;\n  for (let i = 1; i <= n; i++) s += i;\n  return s;\n}\n\nexport function avg(xs) {\n  return xs.reduce((a, b) => a + b, 0) / xs.length;\n}\n",
  "test/range.test.js": "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { sumTo } from \"../src/range.js\";\n\ntest(\"sumTo\", () => assert.equal(sumTo(4), 10));\n",
};

const t = (imp, body) => `import test from "node:test";\nimport assert from "node:assert/strict";\n${imp}\n\n${body}\n`;
const cases = {
  clean: { mode: "green", branch: "feat/chunks", pr: "Add chunks().\n\nAcceptance criteria:\n1. chunks(items, size) returns arrays of at most `size` items.\n2. It throws RangeError unless size is a positive integer.\n",
    files: { "src/chunks.js": "export function chunks(items, size) {\n  if (!Number.isInteger(size) || size < 1) throw new RangeError(\"size must be a positive integer\");\n  const out = [];\n  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));\n  return out;\n}\n",
      "test/chunks.test.js": t('import { chunks } from "../src/chunks.js";', 'test("chunks", () => {\n  assert.deepEqual(chunks([1, 2, 3], 2), [[1, 2], [3]]);\n  assert.throws(() => chunks([1], 0), RangeError);\n  assert.throws(() => chunks([1], NaN), RangeError);\n});') } },
  bug: { mode: "green", branch: "feat/firstn", pr: "Add firstN().\n\nAcceptance criteria:\n1. firstN(items, n) returns the first n items.\n",
    files: { "src/firstn.js": "export function firstN(items, n) {\n  return items.slice(0, n + 1);\n}\n",
      "test/firstn.test.js": t('import { firstN } from "../src/firstn.js";', 'test("firstN of empty", () => assert.deepEqual(firstN([], 3), []));') } },
  rule: { mode: "green", branch: "feat/greet", pr: "Add greet().\n\nAcceptance criteria:\n1. greet(name) returns `Hello, <name>`.\n",
    files: { "src/greet.js": "export default function greet(name) {\n  return `Hello, ${name}`;\n}\n",
      "test/greet.test.js": t('import greet from "../src/greet.js";', 'test("greet", () => assert.equal(greet("Ada"), "Hello, Ada"));') } },
  unwritten: { mode: "green", branch: "feat/greet", pr: "Add greet().\n\nAcceptance criteria:\n1. greet(name) returns `Hello, <name>`.\n",
    files: { "src/greet.js": "export function greet(name) {\n    return 'Hello, ' + name\n}\n",
      "test/greet.test.js": t('import { greet } from "../src/greet.js";', 'test("greet", () => assert.equal(greet("Ada"), "Hello, Ada"));') } },
  redci: { mode: "red", branch: "feat/pad", pr: "Add padLeft().\n\nAcceptance criteria:\n1. padLeft(s, n) pads s with spaces on the left to length n.\n",
    files: { "src/pad.js": "export function padLeft(s, n) {\n  if (!s) return \"\";\n  return s.padStart(n);\n}\n",
      "test/pad.test.js": t('import { padLeft } from "../src/pad.js";', 'test("padLeft pads", () => assert.equal(padLeft("a", 3), "  a"));\ntest("padLeft handles empty string", () => assert.equal(padLeft("", 3), "   "));') } },
  noci: { mode: "none", branch: "feat/neg", pr: "Add neg().\n\nAcceptance criteria:\n1. neg(x) returns -x.\n",
    files: { "src/neg.js": "export const neg = (x) => -x;\n",
      "test/neg.test.js": t('import { neg } from "../src/neg.js";', 'test("neg", () => assert.equal(neg(2), -2));') } },
  legacy: { mode: "green", branch: "feat/sumrange", pr: "Add sumRange().\n\nAcceptance criteria:\n1. sumRange(a, b) returns the sum of the integers a..b inclusive.\n",
    files: { "src/range.js": base["src/range.js"] + "\nexport function sumRange(a, b) {\n  let s = 0;\n  for (let i = a; i <= b; i++) s += i;\n  return s;\n}\n",
      "test/sumrange.test.js": t('import { sumRange } from "../src/range.js";', 'test("sumRange", () => assert.equal(sumRange(2, 4), 9));') } },
  suspicion: { mode: "green", branch: "feat/config", pr: "Add parseConfig().\n\nAcceptance criteria:\n1. parseConfig(text) returns the parsed object.\n2. parseConfig returns null for invalid input (by design; callers check for null).\n",
    files: { "src/config.js": "export function parseConfig(text) {\n  try {\n    const v = JSON.parse(text);\n    return v !== null && typeof v === \"object\" ? v : null;\n  } catch {\n    return null; // invalid input returns null by design\n  }\n}\n",
      "test/config.test.js": t('import { parseConfig } from "../src/config.js";', 'test("parseConfig", () => {\n  assert.deepEqual(parseConfig("{\\"a\\":1}"), { a: 1 });\n  assert.equal(parseConfig("{"), null);\n});') } },
  codeonly: { mode: "green", branch: "feat/label", pr: "Add formatLabel().\n\nAcceptance criteria:\n1. The label prints correctly on the Model-X label printer at 203 dpi.\n2. formatLabel(name, qty) returns the text `<NAME> x<qty>` padded with spaces to 24 characters; a longer text is returned in full, not truncated.\n",
    files: { "src/label.js": "export function formatLabel(name, qty) {\n  return `${name.toUpperCase()} x${qty}`.padEnd(24);\n}\n",
      "test/label.test.js": t('import { formatLabel } from "../src/label.js";', 'test("formatLabel", () => assert.equal(formatLabel("bolt", 3).length, 24));') } },
};
// pressure cases reuse a base case
cases["pressure-clean"] = cases.clean;
cases["pressure-bug"] = cases.bug;
cases["trigger"] = cases.clean;
const c = cases[name];
if (!c) { console.error(`unknown case ${name}; known: ${Object.keys(cases).join(", ")}`); process.exit(2); }

git("init", "-q", "-b", "main"); git("config", "user.email", "eval@example.test"); git("config", "user.name", "eval");
for (const [p, s] of Object.entries(base)) put(p, s);
chmodSync(join(dir, "deploy.sh"), 0o755);
writeFileSync(join(dir, ".git/info/exclude"), ".review/\n.claude/\n");
git("add", "-A"); git("commit", "-qm", "init");
git("checkout", "-qb", c.branch);
for (const [p, s] of Object.entries(c.files)) put(p, s);
git("add", "-A"); git("commit", "-qm", `Add ${c.branch.split("/")[1]}`);
const head = git("rev-parse", "HEAD"), baseSha = git("merge-base", "main", "HEAD");

put(".review/PR.md", c.pr);
// The fake gh lives outside the repo as a plain `gh` in <dir>-env/bin (no ".stub" name); run.mjs puts it first on PATH.
const envDir = `${dir}-env`; mkdirSync(join(envDir, "bin"), { recursive: true });
writeFileSync(join(envDir, "mode"), c.mode); writeFileSync(join(envDir, "sha"), head);
writeFileSync(join(envDir, "bin/gh"), `#!/usr/bin/env bash
d=$(dirname "$0")/..; mode=$(cat "$d/mode"); sha=$(cat "$d/sha")
case "$1 $2" in
  "run list")
    if [ "$mode" = none ]; then echo '[]'; exit 0; fi
    concl=success; [ "$mode" = red ] && concl=failure
    echo "[{\\"databaseId\\":9001,\\"status\\":\\"completed\\",\\"conclusion\\":\\"$concl\\",\\"headSha\\":\\"$sha\\",\\"name\\":\\"CI\\"}]";;
  "pr checks")
    if [ "$mode" = none ]; then echo "no pull requests found for branch" >&2; exit 1; fi
    r=pass; [ "$mode" = red ] && r=fail
    printf 'test\\t%s\\t12s\\thttps://ci.example.test/runs/9001\\n' "$r";;
  "run view")
    case "$*" in
      *--log-failed*) [ "$mode" = red ] && printf 'test\\tRun tests\\tTAP version 13\\ntest\\tRun tests\\tnot ok 2 - padLeft handles empty string\\ntest\\tRun tests\\t  expected: "   "\\ntest\\tRun tests\\t  actual:   ""\\ntest\\tRun tests\\t  at test/pad.test.js:5\\ntest\\tRun tests\\t# fail 1\\n';;
      *--json*) echo '{"jobs":[{"name":"test","conclusion":"'$([ "$mode" = red ] && echo failure || echo success)'","startedAt":"2026-01-01T00:00:00Z","completedAt":"2026-01-01T00:00:12Z"}]}';;
      *) echo "run 9001 on $sha: $mode";;
    esac;;
  *) echo "gh stub: unsupported: $*" >&2; exit 1;;
esac
`);
chmodSync(join(envDir, "bin/gh"), 0o755);
console.log(JSON.stringify({ case: name, dir, branch: c.branch, head, base: baseSha, mode: c.mode }));
