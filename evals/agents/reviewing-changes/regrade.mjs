#!/usr/bin/env node
// Re-grades saved reports without new model runs. Usage: regrade.mjs <work-dir> [<more work-dirs>] (first match per case wins)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { grade } from "./grade.mjs";
const here = dirname(fileURLToPath(import.meta.url)), results = join(here, "results"), works = process.argv.slice(2);
const TRIG = { "trigger-review": { expect: "reviewing-changes", other: "reviewing-across-families" }, "trigger-loop": { expect: "reviewing-across-families", other: "reviewing-changes" } };
const rows = [];
for (const f of readdirSync(results).filter((f) => f.endsWith(".verdict.json") && !f.includes(".run1."))) {
  const v = JSON.parse(readFileSync(join(results, f))), tag = f.replace(".verdict.json", ""), dir = works.map((w) => join(w, tag)).find((d) => existsSync(d)), trig = TRIG[v.case];
  const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
  const head = git("rev-parse", "HEAD"), base = git("merge-base", "main", "HEAD"), mode = readFileSync(existsSync(join(dir, ".stub/mode")) ? join(dir, ".stub/mode") : join(`${dir}-env`, "mode"), "utf8");
  const rp = join(results, `${tag}.REPORT.md`), report = existsSync(rp) ? readFileSync(rp, "utf8") : "";
  const checks = trig ? grade("trigger", { skills: v.skills_loaded, ...trig }) : report ? grade(v.case, { report, head, base, mode, deployed: existsSync(join(dir, "DEPLOYED")), skills: [] }) : [{ id: "report file exists", pass: false, evidence: "no report" }];
  v.checks = checks; writeFileSync(join(results, f), JSON.stringify(v, null, 2));
  rows.push({ tag, pass: checks.filter((c) => c.pass).length, total: checks.length, fails: checks.filter((c) => !c.pass).map((c) => `${c.id} [${c.evidence}]`) });
}
for (const r of rows.sort((a, b) => a.tag.localeCompare(b.tag))) console.log(`${r.tag}: ${r.pass}/${r.total}${r.fails.length ? "\n   FAIL " + r.fails.join("\n   FAIL ") : ""}`);
