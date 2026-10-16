import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('offline helper checks', (t) => {
  const result = spawnSync('python3', ['-B', fileURLToPath(new URL('./offline.py', import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  if (result.stdout.startsWith('SKIP:')) return t.skip(result.stdout.trim());
  assert.match(result.stdout, /PASS/);
});

for (const option of ['--text-file', '--reference-text-file']) {
  test(`${option} rejects a missing file as a bad argument`, () => {
    const args = ['-B', fileURLToPath(new URL('../scripts/clone_voice.py', import.meta.url)),
      'reference.wav', option, 'missing-input.txt', '--out', 'speech.wav'];
    if (option === '--reference-text-file') args.push('--text', 'Hello');
    const result = spawnSync('python3', args, { encoding: 'utf8' });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, new RegExp(`${option} must name an existing file`));
    assert.doesNotMatch(result.stderr, /Errno|Traceback/);
  });
}
