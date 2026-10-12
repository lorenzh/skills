import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../scripts/ansi-html.mjs', import.meta.url));
const usage = `usage: node ansi-html.mjs <capture.ansi|-> [-o file] [--caption text] [--fragment]
  -                  read ANSI capture from stdin
  -o file            write HTML to file instead of stdout
  --caption text     caption below the grid
  --fragment         only the pre block, with inline styles
  --help             print usage
exit 0 ok, 1 failed (read/write error), 2 misuse
`;
const pre = '<pre style="font-family:monospace;font-variant-ligatures:none;font-size:14px;line-height:1.25;white-space:pre;color:#d0d0d0;background:#1e1e1e;padding:16px;margin:0;width:max-content">';
const row = '<span style="display:block;min-height:1.25em">';
const span = (text, style = 'color:#d0d0d0;background:#1e1e1e') => `<span style="${style}">${text}</span>`;
function run(args, input = '') {
  const result = spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8', input, timeout: 10000 });
  assert.ifError(result.error);
  return result;
}
function fragment(input) {
  const result = run(['-', '--fragment'], input);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return result.stdout;
}

test('all 16 foreground and background colours', () => {
  const colours = ['#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
    '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'];
  for (let n = 0; n < 16; n++) {
    const fg = n < 8 ? 30 + n : 90 + n - 8, bg = fg + 10;
    assert.equal(fragment(`\x1b[${fg}mF\x1b[39;${bg}mB\x1b[49mD`),
      pre + row + span('F', `color:${colours[n]};background:#1e1e1e`) +
      span('B', `color:#d0d0d0;background:${colours[n]}`) + span('D') + '</span></pre>\n');
  }
});

test('256-colour table, cube, greys and truecolour', () => {
  for (const [n, expected] of [[0, '#000000'], [15, '#ffffff'], [16, '#000000'], [67, '#5f87af'], [231, '#ffffff'], [232, '#080808'], [244, '#808080'], [255, '#eeeeee']]) {
    assert.equal(fragment(`\x1b[38;5;${n};48;5;${n}mX`), pre + row + span('X', `color:${expected};background:${expected}`) + '</span></pre>\n');
  }
  assert.equal(fragment('\x1b[38;2;1;128;255;48;2;255;16;0mRGB'),
    pre + row + span('RGB', 'color:#0180ff;background:#ff1000') + '</span></pre>\n');
});

test('underline colours consume their parameters without changing other attributes', () => {
  for (const colour of ['58;5;0', '58;5;31', '58;2;255;0;0']) {
    assert.equal(fragment(`\x1b[31m\x1b[${colour}mX\x1b[59mY`), pre + row +
      span('X', 'color:#800000;background:#1e1e1e') + span('Y', 'color:#800000;background:#1e1e1e') + '</span></pre>\n');
    assert.equal(fragment(`\x1b[31;44;1;4;${colour};59;2mX`), pre + row +
      span('X', 'color:#800000;background:#000080;font-weight:bold;opacity:0.5;text-decoration:underline') + '</span></pre>\n');
  }
});

test('concealment hides glyphs without collapsing cells; 28 and 0 reset it', () => {
  const concealed = '<span style="visibility:hidden">hidden 猫 é\t</span>';
  assert.equal(fragment('\x1b[31;44;8mhidden 猫 é\t\x1b[28mA\x1b[8mB\x1b[0mC'), pre + row +
    span(concealed, 'color:#800000;background:#000080') + span('A', 'color:#800000;background:#000080') +
    span('<span style="visibility:hidden">B</span>', 'color:#800000;background:#000080') + span('C') + '</span></pre>\n');
  assert.equal(fragment('\x1b[8m<&>\nsecret\x1b[mvisible'), pre + row +
    span('<span style="visibility:hidden">&lt;&amp;&gt;</span>') + '</span>' + row +
    span('<span style="visibility:hidden">secret</span>') + span('visible') + '</span></pre>\n');
});

test('bold, dim, underline, their resets and full reset', () => {
  assert.equal(fragment('\x1b[1;2;4mA\x1b[22mB\x1b[24mC\x1b[31;44;1;2;4mD\x1b[0mE\x1b[1mF\x1b[mG'), pre + row +
    span('A', 'color:#d0d0d0;background:#1e1e1e;font-weight:bold;opacity:0.5;text-decoration:underline') +
    span('B', 'color:#d0d0d0;background:#1e1e1e;text-decoration:underline') + span('C') +
    span('D', 'color:#800000;background:#000080;font-weight:bold;opacity:0.5;text-decoration:underline') + span('E') +
    span('F', 'color:#d0d0d0;background:#1e1e1e;font-weight:bold') + span('G') + '</span></pre>\n');
});

test('reverse swaps defaults and explicit colours; 27 resets it', () => {
  assert.equal(fragment('\x1b[7mA\x1b[31mB\x1b[44mC\x1b[27mD\x1b[0mE'), pre + row +
    span('A', 'color:#1e1e1e;background:#d0d0d0') + span('B', 'color:#1e1e1e;background:#800000') +
    span('C', 'color:#000080;background:#800000') + span('D', 'color:#800000;background:#000080') + span('E') + '</span></pre>\n');
});

test('escaped text, spaces, blank rows and wide characters keep the column grid', () => {
  const output = fragment('  <&>" 猫 é  \n\n\x1b[31m红\x1b[0m   end\n');
  assert.equal(output, pre + row + span('  &lt;&amp;&gt;&quot; 猫 é  ') + '</span>' + row + '</span>' +
    row + span('红', 'color:#800000;background:#1e1e1e') + span('   end') + '</span></pre>\n');
  const visible = [...output.matchAll(/<span style="display:block;min-height:1.25em">(.*?)<\/span>(?=<span style="display:block|<\/pre>)/gs)]
    .map(match => match[1].replace(/<[^>]*>/g, '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
  assert.deepEqual(visible, ['  <&>" 猫 é  ', '', '红   end']);
});

test('unknown CSI, OSC, control strings and short escape sequences disappear', () => {
  assert.equal(fragment('A\x1b[2KB\x1b]0;hidden title\x07C\x1b]8;;https://example.org\x1b\\D\x1bPsecret\nsecond line\x1b\\E\x1b(BF'),
    pre + row + span('A') + span('B') + span('C') + span('D') + span('E') + span('F') + '</span></pre>\n');
});

test('file input/output, full document and escaped caption', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ansi-html-test-'));
  try {
    const source = join(dir, 'cap.ansi'), out = join(dir, 'cap.html');
    writeFileSync(source, 'X\n');
    const result = run([source, '-o', out, '--caption', 'app <1>&, 100x30, agent 4.5']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    const expected = pre + row + span('X') + '</span><span style="display:block;margin-top:1em;white-space:normal">app &lt;1&gt;&amp;, 100x30, agent 4.5</span></pre>';
    assert.equal(readFileSync(out, 'utf8'), '<!doctype html>\n<html lang="en"><meta charset="utf-8"><title>Terminal capture</title><body style="margin:0;background:#1e1e1e">' + expected + '</body></html>\n');
    assert.equal(run(['-', '--fragment', '--caption', 'app <1>&, 100x30, agent 4.5'], 'X\n').stdout, expected + '\n');
    assert.equal(run([join(dir, 'absent')]).status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('help exits 0 and misuse exits 2', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.equal(help.stdout, usage);
  assert.equal(help.stderr, '');
  for (const args of [[], ['--unknown'], ['-', '--unknown'], ['-', '-o'], ['-', '--caption'], ['-', '-o', '--fragment'], ['-', 'extra']]) {
    const result = run(args);
    assert.equal(result.status, 2, JSON.stringify(args));
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'ansi-html: ' + usage);
  }
});
