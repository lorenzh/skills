import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHIP = fileURLToPath(new URL('../scripts/ship.mjs', import.meta.url));

// Fake gh: keeps PR state in a JSON file, logs every call.
const FAKE_GH = `#!/usr/bin/env node
const fs = require('fs'); const f = process.env.GH_STATE;
const s = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { prs: [], calls: [] };
const a = process.argv.slice(2); s.calls.push(a);
const save = () => fs.writeFileSync(f, JSON.stringify(s));
const k = a.slice(0, 2).join(' ');
if (k === 'pr list') console.log(JSON.stringify(s.prs.filter((p) => p.state === 'OPEN')));
else if (k === 'pr create') { const n = 77 + s.prs.length; s.prs.push({ number: n, url: 'https://github.com/o/r/pull/' + n, state: 'OPEN', body: a[a.indexOf('--body') + 1] }); console.log(s.prs.at(-1).url); }
else if (k === 'pr checks') { if (process.env.GH_CI_FAIL) { save(); console.error('checks failed'); process.exit(1); } }
else if (k === 'pr merge') s.prs.at(-1).state = 'MERGED';
else if (k === 'pr view') console.log(s.prs.at(-1).state);
else if (k === 'issue view') console.log(s.issue || 'OPEN');
save();`;

function setup({ commitMsg = 'fix: part of the bug\n\nRefs #42' } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'ship-'));
  const git = (...a) => execFileSync('git', a, { cwd: join(d, 'wt'), encoding: 'utf8' });
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', join(d, 'origin.git')]);
  execFileSync('git', ['clone', '-q', join(d, 'origin.git'), join(d, 'wt')], { stdio: 'ignore' });
  git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(d, 'wt', 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n- old line\n');
  git('add', '.'); git('commit', '-qm', 'init'); git('push', '-q', 'origin', 'HEAD:main');
  git('checkout', '-qb', 'fix/42');
  writeFileSync(join(d, 'wt', 'a.txt'), 'x'); git('add', '.'); git('commit', '-qm', commitMsg);
  writeFileSync(join(d, 'body.md'), 'Partial fix: the s/a/b/ path.');
  writeFileSync(join(d, 'gh'), FAKE_GH); chmodSync(join(d, 'gh'), 0o755);
  return { d, git };
}
const ship = (d, extra = [], env = {}) => spawnSync(process.execPath, [SHIP, '--dir', join(d, 'wt'), '--issue', '42', '--link', 'refs',
  '--title', 'fix: part of #42', '--body-file', join(d, 'body.md'), '--changelog', '- Fix a/b path (#PR)', ...extra],
{ encoding: 'utf8', env: { ...process.env, PATH: `${d}:${process.env.PATH}`, GH_STATE: join(d, 'gh.json'), ...env } });
const gh = (d) => JSON.parse(readFileSync(join(d, 'gh.json'), 'utf8'));

test('partial fix: Refs in PR and squash body, changelog gets the PR link, issue stays open', () => {
  const { d } = setup();
  const r = ship(d, ['--merge']);
  assert.equal(r.status, 0, r.stderr);
  const s = gh(d);
  assert.match(s.prs[0].body, /Refs #42/);
  const merge = s.calls.find((c) => c[1] === 'merge');
  assert.equal(merge[merge.indexOf('--body') + 1], 'Refs #42');
  assert.match(readFileSync(join(d, 'wt', 'CHANGELOG.md'), 'utf8'), /## \[Unreleased\]\n\n- Fix a\/b path \(\[#77\]\(https:\/\/github.com\/o\/r\/pull\/77\)\)\n- old line/);
});

test('rerun after a failed step reuses the PR and does not repeat the changelog line', () => {
  const { d } = setup();
  assert.equal(ship(d, [], { GH_CI_FAIL: '1' }).status, 1);
  const r = ship(d, ['--merge']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /reusing PR .*77/);
  assert.equal(gh(d).calls.filter((c) => c[1] === 'create').length, 1);
  assert.equal(readFileSync(join(d, 'wt', 'CHANGELOG.md'), 'utf8').split('pull/77').length - 1, 1);
});

test('refs refuses a commit message that would close the issue', () => {
  const { d } = setup({ commitMsg: 'fix: part\n\nFixes #42' });
  const r = ship(d);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /commit message closes #42.*Refs #42/);
  assert.ok(!existsSync(join(d, 'gh.json')), 'no PR call before the check');
});

test('misuse exits 2', () => {
  const r = spawnSync(process.execPath, [SHIP, '--issue', 'x'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});
