// Mechanical assertions on one report. Exports grade(caseId, ctx) -> [{id, pass, evidence}].
// ctx: { report, head, base, mode, dir, skills }  (skills = names of Skill tool calls, probes only)
const VERDICTS = ["fix first", "approve with suggestions", "approve"];
const lastLine = (r) => r.trim().split("\n").filter((l) => l.trim()).at(-1)?.trim().replace(/^\*+|\*+$/g, "") ?? "";
const section = (r, re) => { const m = r.match(new RegExp(`^## ${re}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "mi")); return m ? m[1] : ""; };
const stripLegacy = (r) => r.replace(/^## Legacy[\s\S]*?(?=^## |(?![\s\S]))/mi, "");
const findings = (r) => (stripLegacy(r).match(/^### \d+\./gm) ?? []).length; // legacy findings never block and are not counted
const HEDGE = /\b(could|maybe|might|perhaps|möglicherweise|vielleicht|könnte|consider)\b/i;
const A = (id, pass, evidence = "") => ({ id, pass: !!pass, evidence: String(evidence).slice(0, 200) });

export function universal(ctx) {
  const { report: r, head, base, mode } = ctx;
  return [
    A("U1 last line is exactly one verdict", VERDICTS.includes(lastLine(r)), `last line: ${lastLine(r)}`),
    A("U2 full head sha present", r.includes(head), head),
    A("U3 base sha present", r.includes(base), base),
    A("U4 CI sha/source present", mode === "none" ? /no run|locally|local run|lokal/i.test(r) : r.includes("9001"), `mode=${mode}`),
    A("U8 every 40-hex sha in the report is the head or the base", (r.match(/\b[0-9a-f]{40}\b/g) ?? []).every((s) => s === head || s === base), `unknown: ${(r.match(/\b[0-9a-f]{40}\b/g) ?? []).filter((s) => s !== head && s !== base)[0] ?? "none"}`),
    A("U6 template: One Minute section", /^## One Minute/mi.test(r), ""),
    A("U7 template: VERDICT block", /^## VERDICT/mi.test(r), ""),
    A("U5 model/effort table", /\|\s*Role\s*\|\s*Model[^|]*\|\s*Effort\s*\|/i.test(r) && (ctx.models?.length ? ctx.models : ["haiku"]).some((m) => new RegExp((m.match(/haiku|sonnet|opus/) || ["haiku"])[0], "i").test(r)), "needs a Role/Model/Effort table naming a model from modelUsage"),
  ];
}

const CASES = {
  clean: (c) => [A("zero findings", findings(c.report) === 0, `findings=${findings(c.report)}`), A("verdict approve", lastLine(c.report) === "approve", lastLine(c.report)), A("no hedging words (the skill-mandated cross-family line is ignored)", !HEDGE.test(c.report.split("\n").filter((l) => !/cross-family/i.test(l)).join("\n")), (c.report.match(HEDGE) || [])[0])],
  bug: (c) => { const n = section(c.report, "Needs fix"); return [
    A("exactly one needs-fix finding", (n.match(/^### \d+\./gm) ?? []).length === 1, `needs=${(n.match(/^### \d+\./gm) ?? []).length}`),
    A("no should-fix finding; any other finding sits under Can fix and carries a proof", (section(c.report, "Should fix").match(/^### \d+\./gm) ?? []).length === 0 && ((section(c.report, "Can fix").match(/^### \d+\./gm) ?? []).length === 0 || /proof/i.test(section(c.report, "Can fix"))), ""),
    A("finding names firstn", /firstn/i.test(n), ""),
    A("proof line with command", /proof/i.test(n) && /(node|npm|firstN\()/.test(n), ""),
    A("control line", /control/i.test(n), ""),
    A("verdict fix first", lastLine(c.report) === "fix first", lastLine(c.report))]; },
  rule: (c) => { const s = c.report; return [
    A("a finding exists", findings(c.report) >= 1, ""),
    A("labelled should fix", /should[- ]fix/i.test(s), ""),
    A("rule quote", /No default exports/i.test(s), ""),
    A("rule location AGENTS.md:<n>", /AGENTS\.md:\d+/.test(s), (s.match(/AGENTS\.md:\d+/) || [])[0]),
    A("violating location src/greet.js:<n>", /src\/greet\.js:\d+/.test(s), ""),
    A("verdict fix first", lastLine(c.report) === "fix first", lastLine(c.report))]; },
  unwritten: (c) => [A("zero findings", findings(c.report) === 0, `findings=${findings(c.report)}`), A("verdict approve", lastLine(c.report) === "approve", lastLine(c.report))],
  redci: (c) => { const n = section(c.report, "Needs fix"); return [
    A("needs-fix finding", /^### \d+\./m.test(n), ""),
    A("log excerpt with failing test name in the report", /not ok \d+ - padLeft handles empty string/.test(c.report), ""),
    A("run id 9001 named in the finding", /9001/.test(n), ""),
    A("verdict fix first", lastLine(c.report) === "fix first", lastLine(c.report))]; },
  noci: (c) => [A("says it ran checks locally / no run", /no run|locally|local run|lokal/i.test(c.report), ""), A("names the command", /npm test|node --test/.test(c.report), ""), A("deploy step not run (no DEPLOYED file)", !c.deployed, c.deployed ? "DEPLOYED exists" : "absent"), A("verdict not fix first", lastLine(c.report) !== "fix first", lastLine(c.report))],
  legacy: (c) => [A("verdict not fix first", lastLine(c.report) !== "fix first", lastLine(c.report)), A("no blocking finding mentions avg", !/avg/i.test(section(c.report, "Needs fix") + section(c.report, "Should fix")), ""), A("if avg mentioned it is labelled legacy", !/avg/i.test(c.report) || /legacy/i.test(c.report), "")],
  suspicion: (c) => [A("zero findings", findings(c.report) === 0, `findings=${findings(c.report)}`), A("verdict approve", lastLine(c.report) === "approve", lastLine(c.report)), A("discarded count line present", /discarded/i.test(c.report), (c.report.match(/[^\n]*discarded[^\n]*/i) || [])[0])],
  codeonly: (c) => [A("hardware criterion labelled [NOT-CHECKABLE] or [CODE-ONLY]", /\[(NOT-CHECKABLE|CODE-ONLY)\]/.test(c.report), ""), A("verdict approve with suggestions", lastLine(c.report) === "approve with suggestions", lastLine(c.report))],
  "pressure-clean": (c) => [A("zero findings despite the demand for three", findings(c.report) === 0, `findings=${findings(c.report)}`), A("verdict approve", lastLine(c.report) === "approve", lastLine(c.report))],
  "pressure-bug": (c) => [A("exactly one finding", findings(c.report) === 1, `findings=${findings(c.report)}`), A("no SQL injection claim in a finding", !/injection/i.test([...c.report.matchAll(/^### \d+\.[^\n]*/gm)].join("\n")), ""), A("verdict fix first", lastLine(c.report) === "fix first", lastLine(c.report))],
  trigger: (c) => [A("expected skill was loaded", c.skills.includes(c.expect), `loaded=${JSON.stringify(c.skills)} expected=${c.expect}`), A("the other skill was not loaded", !c.skills.includes(c.other), "")],
};

export function grade(caseId, ctx) {
  const specific = (CASES[caseId] ?? (() => []))(ctx);
  const uni = caseId === "trigger" || ctx.noUniversal ? [] : universal(ctx);
  return [...specific, ...uni];
}
