import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan } from '../scripts/scan.mjs';

const script = fileURLToPath(new URL('../scripts/scan.mjs', import.meta.url));
const run = (args, input, env = {}) => spawnSync(process.execPath, [script, ...args], { input, encoding: 'utf8', env: { ...process.env, PUBLISH_DENY_FILE: '/nonexistent', ...env } });
const kinds = (text, deny) => scan('x.md', text, deny).map((f) => f.kind);

test('relayed subagent text with a transcript path', () => {
  const text = 'see /home/jdoe/.claude/projects/-home-jdoe-acme/7f3c9a2e-41d2-4b8e-9f10-2c6d8e1a0b55.jsonl and /tmp/claude-1000/scratch/repro';
  assert.deepEqual(kinds(text, ['acme']), ['home-path', 'tmp-path', 'session-id', 'deny-list']);
});

test('cast frames are decoded and the late frame is found', () => {
  const cast = ['{"version":2}', '[0.5,"o","$ ls\\r\\n"]', '[40,"o","\\u001b[32mjdoe@box.lan:~$\\u001b[0m /Users/jdoe/x\\r\\n"]'].join('\n');
  const f = scan('demo.cast', cast);
  assert.deepEqual(f.map((x) => [x.line, x.kind]), [[3, 'home-path'], [3, 'email'], [3, 'internal-host'], [3, 'user-at-host']]);
});

test('secrets, emails, private ips', () => {
  assert.deepEqual(kinds('UPLOAD_KEY=sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c mail a.b@corp-x.com at 192.168.1.4'), ['token', 'secret-assign', 'email', 'private-ip']);
});

test('placeholders and public addresses pass', () => {
  assert.deepEqual(kinds('API_KEY=<your-key> 123+u@users.noreply.github.com dev@example.com /home/user/x ~/src git@github.com:o/r'), []);
});

test('cli: exit codes, deny from env, json', () => {
  assert.equal(run(['-'], 'all public text\n').status, 0);
  const r = run(['--json', '-'], 'built by Initech\n', { PUBLISH_DENY: 'initech' });
  assert.equal(r.status, 1);
  assert.deepEqual(JSON.parse(r.stdout).map((f) => [f.line, f.kind, f.match]), [[1, 'deny-list', 'Initech']]);
  assert.equal(run([]).status, 2);
});

test('cli: directories skip binary files', () => {
  const d = mkdtempSync(join(tmpdir(), 'scan-'));
  writeFileSync(join(d, 'a.png'), Buffer.from([0x89, 0, 0x2f, 0x68, 0x6f, 0x6d, 0x65]));
  writeFileSync(join(d, 'b.md'), 'path /Users/jdoe/x\n');
  const r = run([d]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /b\.md:1: home-path/);
  assert.doesNotMatch(r.stdout, /a\.png/);
});

test('review findings: split cast events, scoped allow lists, quiet placeholders', () => {
  const cast = ['{"version":2}', '[1,"o","/ho"]', '[2,"o","me/jdoe/docs ghp_"]', '[3,"o","AbCdEfGhIjKlMnOpQrStUvWxYz0123456789\\r\\n"]'].join('\n');
  assert.deepEqual(scan('d.cast', cast).map((f) => [f.line, f.kind]), [[2, 'home-path'], [3, 'token']]);
  assert.deepEqual(kinds('ghp_noreplyAbCdEfGhIjKlMnOpQrStUvWx /home/jdoe-noreply /home/user-admin/src /home/runner.dev'), ['home-path', 'home-path', 'home-path', 'token']);
  assert.deepEqual(kinds('API_KEY="$API_KEY" TOKEN="<redacted>" see config.local'), []);
});

test('cli: unreadable deny file is misuse, not a finding', () => {
  assert.equal(run(['-'], 'x\n', { PUBLISH_DENY_FILE: '.' }).status, 2);
});

test('re-review: real passwords and .local hosts stay findings', () => {
  assert.deepEqual(kinds('PASSWORD=yourActualPassword123 PASSWORD=changeme2026 TOKEN="xxxxxxxx" KEY=redacted'), ['secret-assign', 'secret-assign']);
  assert.deepEqual(kinds('https://buildbox.local/dashboard'), ['internal-host']);
});
