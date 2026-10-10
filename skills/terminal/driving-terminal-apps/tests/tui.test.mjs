import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../scripts/tui.mjs', import.meta.url));
function tui(args, env = {}) {
  const result = spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 30000 });
  assert.ifError(result.error);
  return result;
}
function ok(args, env) {
  const result = tui(args, env);
  assert.equal(result.status, 0, `${args[0]}: ${result.stderr || result.error || result.stdout}`);
  return result.stdout;
}
const tools = ok(['tools']);
const have = name => !tools.split('\n').find(line => line.startsWith(`${name} `))?.includes('MISSING');

test('help, tool discovery and misuse exit codes', () => {
  assert.match(ok(['--help']), /exit 0 ok, 1 failed.*2 misuse/);
  assert.match(tools, /^node\s+\S+/m);
  assert.doesNotMatch(tools, /^python3\s/m);
  for (const args of [[], ['bogus', 'x'], ['key', 'x'], ['key', 'x', 'Enter', '-1'], ['start', 'x', '-s', 'bad', '--', 'true'], ['find', 'x', '['], ['stop', '../x'], ['render', 'x.cast', 'x.txt']]) {
    assert.equal(tui(args).status, 2, JSON.stringify(args));
  }
});

test('tool discovery skips executable directories and finds regular fallback files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tui-tools-test-'));
  try {
    const bin = join(dir, 'bin');
    const fallback = join(dir, 'fallback');
    mkdirSync(fallback);
    for (const tool of ['tmux', 'agg', 'asciinema']) mkdirSync(join(bin, tool), { recursive: true });
    writeFileSync(join(fallback, 'agg'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const result = ok(['tools'], { PATH: bin, TUI_TOOLS: fallback });
    assert.match(result, /^tmux\s+MISSING/m);
    assert.match(result, /^asciinema\s+MISSING/m);
    assert.ok(result.includes(`agg        ${join(fallback, 'agg')}`));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('stop escalates every snapshot process still alive, reparented ones included', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tui-stop-test-'));
  try {
    const calls = join(dir, 'calls.jsonl');
    const preload = join(dir, 'signals.mjs');
    writeFileSync(preload, `import {appendFileSync} from 'node:fs';\nprocess.kill = (pid, signal) => { if (signal === 0) { if (pid === 101) throw Object.assign(new Error('gone'), { code: 'ESRCH' }); return true; } appendFileSync(process.env.TUI_TEST_CALLS, JSON.stringify([pid, signal]) + '\\n'); return true; };\n`);
    writeFileSync(join(dir, 'tmux'), `#!${process.execPath}
import {appendFileSync} from 'node:fs';
const command = process.argv[6];
if (command === 'list-panes') console.log('100');
if (command === 'kill-server') appendFileSync(process.env.TUI_TEST_CALLS, JSON.stringify(['kill-server']) + '\\n');
if (command === 'has-session') process.exitCode = 1;
`, { mode: 0o755 });
    writeFileSync(join(dir, 'ps'), `#!${process.execPath}
import {existsSync, writeFileSync} from 'node:fs';
const marker = process.env.TUI_TEST_CALLS + '.ps';
console.log(existsSync(marker) ? '100 1\\n102 100\\n103 1\\n104 100' : '100 1\\n101 100\\n102 100\\n103 100');
writeFileSync(marker, '');
`, { mode: 0o755 });
    ok(['stop', `stop-test-${process.pid}`], { PATH: dir, TUI_TEST_CALLS: calls, NODE_OPTIONS: `--import=${preload}` });
    assert.deepEqual(readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse), [
      [101, 'SIGTERM'], [102, 'SIGTERM'], [103, 'SIGTERM'], [100, 'SIGTERM'],
      [102, 'SIGKILL'], [103, 'SIGKILL'], [100, 'SIGKILL'], ['kill-server'],
    ]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('frame keeps v2 absolute and v3 cumulative timing, including non-output events', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tui-frame-test-'));
  try {
    const agg = join(dir, 'agg');
    writeFileSync(agg, `#!${process.execPath}\nimport('node:fs').then(({copyFileSync})=>copyFileSync(process.argv.at(-2),process.argv.at(-1)));\n`, { mode: 0o755 });
    for (const version of [2, 3]) {
      const source = join(dir, `${version}.cast`);
      const header = version === 2 ? { version, width: 30, height: 5 } : { version, term: { cols: 30, rows: 5 } };
      const events = version === 2
        ? [[0, 'o', 'A'], [0.5, 'i', 'input'], [1, 'o', 'B'], [1.5, 'o', 'C']]
        : [[0, 'o', 'A'], [0.5, 'i', 'input'], [0.5, 'o', 'B'], [0.5, 'o', 'C']];
      writeFileSync(source, [header, ...events].map(JSON.stringify).join('\n') + '\n');
      for (const [time, expected] of [['0', 'A'], ['0.75', 'A'], ['1', 'AB'], ['2', 'ABC']]) {
        const out = join(dir, `${version}-${time}.gif`);
        ok(['frame', source, time, out], { PATH: '', TUI_TOOLS: dir });
        const result = readFileSync(out, 'utf8').trim().split('\n').map(JSON.parse);
        assert.deepEqual(result, [header, [0, 'o', expected], [0.5, 'o', '']]);
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('click sends SGR press/release bytes and ffmpeg receives PNG/MP4 conversion flags', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tui-forwarding-test-'));
  try {
    const calls = join(dir, 'tmux.jsonl');
    writeFileSync(join(dir, 'tmux'), `#!${process.execPath}\nimport('node:fs').then(({appendFileSync})=>appendFileSync(process.env.TUI_TEST_CALLS,JSON.stringify(process.argv.slice(2))+'\\n'));\n`, { mode: 0o755 });
    const env = { PATH: dir, TUI_TOOLS: dir, TUI_TEST_CALLS: calls };
    ok(['click', 'demo', '3', '4'], env);
    const presses = readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(presses.length, 2);
    for (const [index, suffix] of ['M', 'm'].entries()) {
      assert.deepEqual(presses[index].slice(0, 8), ['-L', 'demo', '-f', '/dev/null', 'send-keys', '-t', 'demo', '-H']);
      assert.equal(Buffer.from(presses[index].slice(8).map(byte => parseInt(byte, 16))).toString(), `\x1b[<0;3;4${suffix}`);
    }
    writeFileSync(join(dir, 'agg'), `#!${process.execPath}\nimport('node:fs').then(({copyFileSync})=>copyFileSync(process.argv.at(-2),process.argv.at(-1)));\n`, { mode: 0o755 });
    writeFileSync(join(dir, 'ffmpeg'), `#!${process.execPath}\nimport('node:fs').then(({writeFileSync})=>writeFileSync(process.argv.at(-1),JSON.stringify(process.argv.slice(2))));\n`, { mode: 0o755 });
    const source = join(dir, 'source.cast');
    writeFileSync(source, '{}\n');
    for (const extension of ['png', 'mp4']) {
      const out = join(dir, `out.${extension}`);
      ok(['render', source, out], env);
      const forwarded = JSON.parse(readFileSync(out, 'utf8'));
      assert.deepEqual(forwarded.slice(0, 5), ['-loglevel', 'error', '-y', '-i', forwarded[4]]);
      assert.match(forwarded[4], /capture\.gif$/);
      assert.equal(existsSync(forwarded[4]), false, 'temporary GIF removed');
      assert.deepEqual(forwarded.slice(5), extension === 'png'
        ? ['-vf', 'select=eq(n\\,0)', '-frames:v', '1', out]
        : ['-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', out]);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('real tmux: literal typing, captures, GIFs, recording, quoting and process cleanup', { skip: !have('tmux') }, () => {
  const dir = mkdtempSync(join(tmpdir(), "tui integration ' "));
  const name = `tuitest-${process.pid}`;
  const fixture = join(dir, 'app.mjs');
  const argvFile = join(dir, 'argv.json');
  const childFile = join(dir, 'children.json');
  const record = join(dir, 'record.cast');
  const appArgs = ['space here', "single'quote", 'double"quote', '$HOME `id` $(id)', ';', 'line\nbreak', 'é猫'];
  writeFileSync(fixture, `
import {writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
process.on('SIGTERM',()=>{});
writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(4)));
const childCode = "const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const child=spawn(process.execPath,['-e','process.on(\\\"SIGTERM\\\",()=>{});setInterval(()=>{},1000)']);writeFileSync(process.argv[1],JSON.stringify([process.ppid,process.pid,child.pid]));process.on('SIGTERM',()=>{});console.log('READY');setInterval(()=>{},1000);";
spawn(process.execPath, ['-e', childCode, process.argv[3]], {stdio:['ignore', 'inherit', 'inherit']});
createInterface({input:process.stdin}).on('line', line => {
 console.log('\\x1b[31mRED\\x1b[0m ' + line);
});
`);
  try {
    for (const recording of [false, ...(have('asciinema') ? [true] : [])]) {
      const start = ['start', name, '-s', '80x20', ...(recording ? ['-r', record] : []), '--', process.execPath, fixture, argvFile, childFile, ...appArgs];
      ok(start);
      ok(['wait', name, '^READY$', '10']);
      assert.deepEqual(JSON.parse(readFileSync(argvFile, 'utf8')), appArgs);
      assert.equal(tui(start).status, 1);
      ok(['type', name, 'C-c Enter é猫']);
      ok(['key', name, 'Enter', '0.2']);
      ok(['wait', name, '^RED C-c Enter é猫$', '5']);
      const screen = ok(['cap', name]);
      const row = screen.split('\n').findIndex(line => line === 'RED C-c Enter é猫') + 1;
      assert.equal(ok(['find', name, '^RED C-c']), `1 ${row}\n`);
      assert.equal(tui(['find', name, 'absent']).status, 1);
      assert.match(ok(['cap', name, '-e']), /\x1b\[31mRED/);
      const timeout = tui(['wait', name, 'never-there', '0.05']);
      assert.equal(timeout.status, 1);
      assert.match(timeout.stderr, /timeout waiting.*screen:/s);
      for (const extension of ['txt', 'ansi', ...(have('agg') ? ['gif'] : [])]) {
        const out = join(dir, `screen.${extension}`);
        ok(['shot', name, out]);
        assert.ok(readFileSync(out).length > 0);
        if (extension === 'gif') assert.match(readFileSync(out).subarray(0, 6).toString(), /^GIF8[79]a$/);
      }
      if (have('agg') && !have('ffmpeg')) {
        const missing = tui(['shot', name, join(dir, 'screen.png')]);
        assert.equal(missing.status, 1);
        assert.match(missing.stderr, /ffmpeg not found.*keep the .gif instead/);
      }
      const pids = JSON.parse(readFileSync(childFile, 'utf8'));
      for (const pid of pids) assert.doesNotThrow(() => process.kill(pid, 0));
      ok(['stop', name]);
      for (const pid of pids) {
        const result = spawnSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' });
        assert.ok(result.status !== 0 || result.stdout.trim().startsWith('Z'), `live process ${pid}: ${result.stdout}`);
      }
      assert.notEqual(spawnSync('tmux', ['-L', name, 'has-session']).status, 0);
      assert.equal(existsSync(join(process.env.TMUX_TMPDIR || '/tmp', `tmux-${process.getuid()}`, name)), false);
      ok(['stop', name]);
      if (recording && have('agg')) {
        const gif = join(dir, 'record.gif');
        ok(['render', record, gif, '--font-size', '12']);
        assert.match(readFileSync(gif).subarray(0, 6).toString(), /^GIF8[79]a$/);
        for (const version of [2, 3]) {
          const source = join(dir, `real-${version}.cast`);
          const header = version === 2 ? { version, width: 30, height: 5 } : { version, term: { cols: 30, rows: 5 } };
          writeFileSync(source, [header, [0, 'o', 'A'], [0.5, 'o', 'B']].map(JSON.stringify).join('\n') + '\n');
          ok(['frame', source, '0.5', join(dir, `frame-${version}.gif`)]);
        }
        if (!have('ffmpeg')) {
          for (const extension of ['png', 'mp4']) {
            const result = tui(['render', record, join(dir, `record.${extension}`)]);
            assert.equal(result.status, 1);
            assert.match(result.stderr, /ffmpeg not found.*keep the .gif instead/);
          }
          assert.ok(existsSync(gif), 'GIF fallback remains available');
        }
      }
    }
  } finally { tui(['stop', name]); rmSync(dir, { recursive: true, force: true }); }
});
