#!/usr/bin/env node
// Drive, capture and record a terminal app in its own tmux server.
import { spawnSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const usage = `usage: node tui.mjs <command> <name> [args]
  start  <name> [-r cast] [-s WxH] -- cmd...   new tmux server -L <name> running cmd (-r: record with asciinema)
  type   <name> <text>                         type text literally (no Enter)
  key    <name> <key> [secs=0.6]               send one tmux key (Enter, Down, C-c, q, ...), then sleep
  click  <name> <col> <row>                    SGR mouse click at 1-based cell
  wait   <name> <regex> [secs=30]              wait until the screen matches; exit 1 on timeout
  find   <name> <regex>                        print "col row" (1-based cells) of the first match
  cap    <name> [-e]                           print the screen (-e: keep colours)
  shot   <name> <out.txt|.ansi|.gif|.png>       screenshot of the current screen
  frame  <cast> <secs> <out.gif|.png>          still of a recording at a time
  render <cast> <out.gif|.mp4> [agg args]      recording to video
  stop   <name>                                kill the session <name> and its processes; the server and
                                               socket go with the last session
  tools                                        show which helper tools were found
exit 0 ok, 1 failed (timeout, no match, missing tool), 2 misuse
`;
function fail(message, code = 1) { throw Object.assign(new Error(message), { code }); }
function check(condition) { if (!condition) fail(usage.trimEnd(), 2); }
function run(command, args, quiet = false) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (!quiet && (result.error || result.status !== 0)) fail(result.error?.message || result.stderr.trim() || `${command} failed`);
  return result;
}
function tool(name, fallback = true) {
  const dirs = (process.env.PATH || '').split(delimiter);
  if (fallback) dirs.push(process.env.TUI_TOOLS || join(homedir(), '.local/share/tui-tools'));
  for (const dir of dirs) {
    const file = resolve(dir, name);
    try { if (statSync(file).isFile()) { accessSync(file, constants.X_OK); return file; } } catch {}
  }
}
function need(name, fix) {
  return tool(name) || fail(`${name} not found on PATH or in \${TUI_TOOLS:-~/.local/share/tui-tools}; ${fix}`);
}
function seconds(value) {
  check(value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0);
  return Number(value);
}
function regex(value) {
  try { return new RegExp(value); } catch (error) { fail(`invalid regex: ${error.message}`, 2); }
}
// A grapheme cluster (ZWJ sequence, flag pair, skin tone, base + combining mark) is as wide as its widest code point.
// ponytail: main East Asian Wide/Fullwidth blocks plus emoji presentation; rare wide code points count 1.
const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });
function cells(text) {
  let width = 0;
  for (const { segment } of graphemes.segment(text)) width += Math.max(0, ...Array.from(segment, codeWidth));
  return width;
}
function codeWidth(char) {
  if (/[\p{Mn}\p{Me}\p{Cf}]/u.test(char)) return 0;
  return /[\p{Emoji_Presentation}\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}]/u.test(char) ? 2 : 1;
}
function quote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
async function temporary(extension, action) {
  const dir = mkdtempSync(join(tmpdir(), 'tui-'));
  try { return await action(join(dir, `capture.${extension}`)); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function cast(header, text) {
  return [header, [0, 'o', text], [0.5, 'o', '']].map(value => JSON.stringify(value)).join('\n') + '\n';
}
async function render(source, out, extra = []) {
  check(/\.(gif|png|mp4)$/.test(out));
  const agg = need('agg', 'install from https://github.com/asciinema/agg/releases');
  if (out.endsWith('.gif')) { run(agg, ['-q', '--idle-time-limit', '3', ...extra, source, out]); return; }
  const ffmpeg = need('ffmpeg', 'keep the .gif instead');
  await temporary('gif', async gif => {
    run(agg, ['-q', '--idle-time-limit', '3', ...extra, source, gif]);
    const options = out.endsWith('.png')
      ? ['-vf', 'select=eq(n\\,0)', '-frames:v', '1']
      : ['-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2'];
    run(ffmpeg, ['-loglevel', 'error', '-y', '-i', gif, ...options, out]);
  });
}

async function main([command, ...args]) {
  if (['-h', '--help', 'help'].includes(command)) { process.stdout.write(usage); return; }
  if (command === 'tools') {
    check(args.length === 0);
    const tools = [
      ['tmux', tool('tmux', false), 'MISSING (must be on PATH)'],
      ['node', process.execPath],
      ['asciinema', tool('asciinema'), 'MISSING: https://github.com/asciinema/asciinema/releases'],
      ['agg', tool('agg'), 'MISSING: https://github.com/asciinema/agg/releases'],
      ['ffmpeg', tool('ffmpeg'), 'MISSING: GIF only, no PNG/MP4'],
    ];
    for (const [name, path, missing] of tools) console.log(`${name.padEnd(10)} ${path || missing}`);
    return;
  }
  if (command === 'render') { check(args.length >= 2); await render(args[0], args[1], args.slice(2)); return; }
  if (command === 'frame') {
    check(args.length === 3 && /\.(gif|png)$/.test(args[2]));
    const time = seconds(args[1]);
    const [first, ...lines] = readFileSync(args[0], 'utf8').split(/\r?\n/);
    const header = JSON.parse(first);
    check(header.version === 2 || header.version === 3);
    let now = 0;
    let text = '';
    for (const line of lines) {
      if (!line.startsWith('[')) continue;
      const event = JSON.parse(line);
      now = header.version === 3 ? now + event[0] : event[0];
      if (now > time) break;
      if (event[1] === 'o') text += event[2];
    }
    await temporary('cast', async file => { writeFileSync(file, cast(header, text)); await render(file, args[2]); });
    return;
  }
  check(['start', 'type', 'key', 'click', 'wait', 'find', 'cap', 'shot', 'stop'].includes(command) && args.length >= 1);
  const name = args.shift();
  check(name.length > 0 && !/[\/\0]/.test(name));
  const tmux = (values, quiet = false) => run('tmux', ['-L', name, '-f', '/dev/null', ...values], quiet);
  const screen = (colours = false) => tmux(['capture-pane', '-p', ...(colours ? ['-e'] : []), '-t', name]).stdout;
  const sendBytes = text => tmux(['send-keys', '-t', name, '-H', ...Array.from(Buffer.from(text), byte => byte.toString(16).padStart(2, '0'))]);
  switch (command) {
    case 'start': {
      let recording;
      let size = '160x50';
      while (args.length && args[0] !== '--') {
        check(['-r', '-s'].includes(args[0]) && args.length >= 2);
        const option = args.shift();
        if (option === '-r') recording = args.shift(); else size = args.shift();
      }
      if (args[0] === '--') args.shift();
      check(args.length > 0 && /^[1-9]\d*x[1-9]\d*$/.test(size));
      if (tmux(['has-session'], true).status === 0) fail(`server ${name} already runs; tui stop ${name} first`);
      if (recording) args = [need('asciinema', 'install from https://github.com/asciinema/asciinema/releases'), 'rec', '-q', '--overwrite', '-c', args.map(quote).join(' '), recording];
      const [width, height] = size.split('x');
      const launch = ['env', 'TERM=xterm-256color', 'COLORTERM=truecolor', `LANG=${process.env.TUI_LANG || 'C.UTF-8'}`, 'LC_ALL=', 'LANGUAGE=', 'LC_MESSAGES=', ...args].map(quote).join(' ');
      tmux(['new-session', '-d', '-s', name, '-x', width, '-y', height, launch,
        ';', 'set', '@tui', '1', ';', 'set', '-g', 'status', 'off', ';', 'set', '-g', 'escape-time', '10', ';', 'set', '-g', 'focus-events', 'on', ';', 'set', '-g', 'remain-on-exit', 'on']);
      break;
    }
    case 'type':
      check(args.length === 1);
      for (let chars = Array.from(args[0]); chars.length;) { sendBytes(chars.splice(0, 4).join('')); await sleep(20); }
      break;
    case 'key':
      check(args.length >= 1 && args.length <= 2);
      { const pause = seconds(args[1] ?? '0.6'); tmux(['send-keys', '-t', name, args[0]]); await sleep(pause * 1000); }
      break;
    case 'click':
      check(args.length === 2 && args.every(value => /^[1-9]\d*$/.test(value)));
      sendBytes(`\x1b[<0;${args[0]};${args[1]}M`);
      await sleep(80);
      sendBytes(`\x1b[<0;${args[0]};${args[1]}m`);
      break;
    case 'wait': {
      check(args.length >= 1 && args.length <= 2);
      const match = regex(args[0]);
      const end = Date.now() + seconds(args[1] ?? '30') * 1000;
      do {
        if (screen().split('\n').some(line => match.test(line))) return;
        const remaining = end - Date.now();
        if (remaining <= 0) break;
        await sleep(Math.min(1000, remaining));
      } while (Date.now() <= end);
      fail(`timeout waiting for /${args[0]}/; screen:\n${screen()}`);
      break;
    }
    case 'find': {
      check(args.length === 1);
      const match = regex(args[0]);
      const lines = screen().split('\n');
      for (let row = 0; row < lines.length; row++) {
        const found = match.exec(lines[row]);
        if (found) { console.log(`${cells(lines[row].slice(0, found.index)) + 1} ${row + 1}`); return; }
      }
      process.exitCode = 1;
      break;
    }
    case 'cap':
      check(args.length === 0 || (args.length === 1 && args[0] === '-e'));
      process.stdout.write(screen(args[0] === '-e'));
      break;
    case 'shot': {
      check(args.length === 1 && /\.(txt|ansi|gif|png)$/.test(args[0]));
      const out = args[0];
      if (/\.(txt|ansi)$/.test(out)) { writeFileSync(out, screen(out.endsWith('.ansi'))); break; }
      const [width, height] = tmux(['display', '-p', '-t', name, '#{pane_width} #{pane_height}']).stdout.trim().split(' ').map(Number);
      const text = '\x1b[H\x1b[2J' + screen(true).replace(/\n+$/, '').replaceAll('\n', '\r\n');
      await temporary('cast', async file => { writeFileSync(file, cast({ version: 2, width, height }, text)); await render(file, out); });
      break;
    }
    case 'stop': {
      check(args.length === 0);
      if (tmux(['has-session', '-t', `=${name}`], true).status === 0 && tmux(['show-options', '-t', `=${name}:`, '-v', '@tui'], true).stdout?.trim() !== '1') fail(`session ${name} was not started by tui start; left running`);
      const roots = tmux(['list-panes', '-s', '-t', `=${name}`, '-F', '#{pane_pid}'], true).stdout?.trim().split(/\s+/).filter(Boolean).map(Number) || [];
      function descendants() {
        const rows = run('ps', ['-eo', 'pid=,ppid=']).stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
        const pids = [];
        function tree(pid) { for (const [child, parent] of rows) if (parent === pid) tree(child); pids.push(pid); }
        for (const root of roots) if (rows.some(([pid]) => pid === root)) tree(root);
        return pids;
      }
      let pids = descendants();
      // shortcut: children forked after the snapshot survive; check pgrep after stop for daemonizing apps.
      for (const signal of ['SIGTERM', 'SIGKILL']) {
        for (const pid of pids) { try { process.kill(pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
        if (signal === 'SIGTERM') {
          await sleep(500);
          pids = pids.filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
        }
      }
      tmux(['kill-session', '-t', `=${name}`], true);
      if (tmux(['has-session', '-t', `=${name}`], true).status === 0) fail(`session ${name} still runs`);
      if (tmux(['list-sessions'], true).status !== 0) rmSync(join(process.env.TMUX_TMPDIR || '/tmp', `tmux-${process.getuid()}`, name), { force: true });
      break;
    }
  }
}

try { await main(process.argv.slice(2)); } catch (error) {
  console.error(`tui: ${error.message}`);
  process.exitCode = error.code === 2 ? 2 : 1;
}
