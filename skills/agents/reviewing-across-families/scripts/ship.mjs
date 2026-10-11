#!/usr/bin/env node
// Ships a reviewed branch: rebase on fresh origin, push, PR, changelog link, CI, squash merge.
// Every step checks the state first, so a rerun after a failure resumes instead of repeating.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const USAGE = `usage: node ship.mjs --dir <worktree> --issue <n> --link fixes|refs --title <pr title>
                    --body-file <file> [--changelog "<line>"] [--base main] [--merge]

  --dir        worktree with the reviewed branch checked out, clean
  --issue      issue number the change belongs to
  --link       fixes: the change closes the issue; refs: partial, the issue stays open
  --title      PR title (also the squash subject)
  --body-file  PR body; the script adds the "Fixes #n" / "Refs #n" line
  --changelog  line to add under "## [Unreleased]" in CHANGELOG.md; "(#PR)" is replaced
               by the PR link once the PR exists
  --merge      squash-merge after CI passes; without it the script stops at green CI.
               A run that had to rebase stops before the merge: rerun the tests (and
               re-review if the diff changed), then rerun the same command

Steps, each skipped when already done: fetch, rebase on origin/<base>, push,
PR (reused if open), changelog line, CI watch, merge, issue state check.
exit 0 done, 1 a step failed (the message names it; fix and rerun), 2 misuse.`;

const fail = (msg, code = 1) => { console.error(msg); process.exit(code); };

function args(argv) {
  const o = { base: 'main', merge: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--help' || k === '-h') { console.log(USAGE); process.exit(0); }
    if (k === '--merge') { o.merge = true; continue; }
    const name = { '--dir': 'dir', '--issue': 'issue', '--link': 'link', '--title': 'title',
      '--body-file': 'bodyFile', '--changelog': 'changelog', '--base': 'base' }[k];
    if (!name || i + 1 >= argv.length) fail(`unknown or empty option '${k}'\n\n${USAGE}`, 2);
    o[name] = argv[++i];
  }
  for (const k of ['dir', 'issue', 'link', 'title', 'bodyFile']) if (!o[k]) fail(`missing --${k === 'bodyFile' ? 'body-file' : k}\n\n${USAGE}`, 2);
  if (!/^\d+$/.test(o.issue)) fail(`--issue '${o.issue}' is not a number`, 2);
  if (!['fixes', 'refs'].includes(o.link)) fail(`--link must be fixes or refs, not '${o.link}'`, 2);
  if (o.changelog && !o.changelog.includes('(#PR)')) fail('--changelog needs the (#PR) placeholder, e.g. "- Fix the parser (#PR)"', 2);
  if (!existsSync(o.bodyFile)) fail(`--body-file ${o.bodyFile} does not exist`, 2);
  return o;
}

const o = args(process.argv.slice(2));
const sh = (cmd, a, step) => {
  try { return execFileSync(cmd, a, { cwd: o.dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (e) { fail(`${step} failed: ${cmd} ${a.join(' ')}\n${(e.stderr || e.message).trim()}`); }
};
const say = (m) => console.log(m);
const keyword = o.link === 'fixes' ? 'Fixes' : 'Refs';
const ref = `${keyword} #${o.issue}`;
const closing = new RegExp(`\\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\\b:?\\s+([\\w.-]+\\/[\\w.-]+)?#${o.issue}\\b`, 'i');

const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], 'branch');
if (branch === 'HEAD' || branch === o.base) fail(`${o.dir} is on '${branch}'; check out the reviewed branch`, 2);
if (sh('git', ['status', '--porcelain'], 'status')) fail('worktree has uncommitted changes; commit or stash them first');

let body = readFileSync(o.bodyFile, 'utf8').trim();
if (o.link === 'refs' && closing.test(o.title)) fail(`--title closes #${o.issue}; a partial fix uses "${ref}"`);
if (o.link === 'refs' && closing.test(body)) fail(`body file closes #${o.issue}; a partial fix uses "${ref}"`);
if (!body.includes(ref)) body += `\n\n${ref}`;
if (o.link === 'refs') {
  const msgs = sh('git', ['log', '--format=%B', `origin/${o.base}..HEAD`], 'log');
  if (closing.test(msgs)) fail(`a commit message closes #${o.issue}; reword it to "${ref}" before shipping`);
}

const prs = JSON.parse(sh('gh', ['pr', 'list', '--head', branch, '--base', o.base, '--state', 'all', '--json', 'number,url,state,headRefOid'], 'pr lookup') || '[]');
const head = sh('git', ['rev-parse', 'HEAD'], 'head');
const merged = prs.find((p) => p.state === 'MERGED' && p.headRefOid === head);
if (merged && !prs.some((p) => p.state === 'OPEN')) { say(`PR ${merged.url} is already merged`); verify(merged); }

sh('git', ['fetch', 'origin', o.base], 'fetch (no network? ship from a machine that can reach origin)');
if (sh('git', ['rev-list', '--count', `HEAD..origin/${o.base}`], 'behind check') !== '0') {
  sh('git', ['rebase', `origin/${o.base}`], 'rebase (resolve conflicts, rerun tests, get a re-review, rerun)');
  if (o.merge) { o.merge = false; say(`rebased on origin/${o.base}: merge skipped; rerun the tests, re-review if the diff changed, then rerun`); }
  else say(`rebased on origin/${o.base}: rerun the tests`);
}
sh('git', ['push', '--force-with-lease', '-u', 'origin', branch], 'push');
say(`pushed ${branch}`);

let pr = prs.find((p) => p.state === 'OPEN');
if (pr) {
  sh('gh', ['pr', 'edit', String(pr.number), '--body', body], 'pr body update');
  say(`reusing PR ${pr.url} (body updated)`);
} else {
  const url = sh('gh', ['pr', 'create', '--base', o.base, '--head', branch, '--title', o.title, '--body', body], 'pr create');
  pr = { url, number: Number(url.split('/').pop()) };
  say(`opened PR ${url}`);
}

if (o.changelog) {
  const file = join(o.dir, 'CHANGELOG.md');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (text.includes(pr.url)) say('changelog already links the PR');
  else {
    const at = text.search(/^## \[?Unreleased\]?.*$/m);
    if (at < 0) fail('CHANGELOG.md has no "## [Unreleased]" heading; add it and rerun');
    const end = text.indexOf('\n', at);
    const head = end < 0 ? `${text}\n` : text.slice(0, end + 1);
    const line = o.changelog.replace('(#PR)', `([#${pr.number}](${pr.url}))`);
    writeFileSync(file, `${head}\n${line}${end < 0 ? '\n' : text.slice(end + 1).replace(/^\n?/, '\n')}`);
    try {
      execFileSync('git', ['commit', '-m', `docs: add changelog line for #${pr.number}`, '--', 'CHANGELOG.md'], { cwd: o.dir, stdio: 'pipe' });
    } catch (e) {
      sh('git', ['checkout', '--', 'CHANGELOG.md'], 'changelog restore');
      fail(`changelog commit failed (line removed again; fix the cause and rerun)\n${String(e.stderr || e.message).trim()}`);
    }
    sh('git', ['push', 'origin', branch], 'changelog push');
    say('changelog line added with the PR link');
  }
}

sh('gh', ['pr', 'checks', String(pr.number), '--watch', '--fail-fast'], 'CI (read the failed log, fix, re-review, rerun)');
say('CI green');
if (!o.merge) { say('stopped before merge (no --merge)'); process.exit(0); }

sh('gh', ['pr', 'merge', String(pr.number), '--squash', '--subject', `${o.title} (#${pr.number})`, '--body', ref], 'merge');
verify(pr);

function verify(p) {
  const state = sh('gh', ['pr', 'view', String(p.number), '--json', 'state', '--jq', '.state'], 'merge check');
  if (state !== 'MERGED') fail(`PR state is ${state}, not MERGED (auto-merge queued or blocked?)`);
  const issue = sh('gh', ['issue', 'view', o.issue, '--json', 'state', '--jq', '.state'], 'issue check');
  const want = o.link === 'refs' ? 'OPEN' : 'CLOSED';
  if (issue !== want) fail(`PR merged, but issue #${o.issue} is ${issue}, expected ${want}: ${o.link === 'refs' ? 'reopen it' : `close it by hand (closing keywords act only on the default branch)`}`);
  say(`merged ${p.url}; issue #${o.issue} is ${issue}`);
  process.exit(0);
}
