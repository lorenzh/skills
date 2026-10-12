#!/usr/bin/env node
// Convert a coloured tmux capture into a fixed-grid HTML preview.
import { readFileSync, writeFileSync } from 'node:fs';

const usage = `usage: node ansi-html.mjs <capture.ansi|-> [-o file] [--caption text] [--fragment]
  -                  read ANSI capture from stdin
  -o file            write HTML to file instead of stdout
  --caption text     caption below the grid
  --fragment         only the pre block, with inline styles
  --help             print usage
exit 0 ok, 1 failed (read/write error), 2 misuse
`;
function check(condition) { if (!condition) throw Object.assign(new Error(usage.trimEnd()), { code: 2 }); }
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const palette = ['#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
  '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'];
const rgb = values => '#' + values.map(value => value.toString(16).padStart(2, '0')).join('');
function colour(n) {
  if (n < 16) return palette[n];
  if (n >= 232) return rgb(Array(3).fill(8 + 10 * (n - 232)));
  const levels = [0, 95, 135, 175, 215, 255];
  n -= 16;
  return rgb([levels[Math.floor(n / 36)], levels[Math.floor(n / 6) % 6], levels[n % 6]]);
}
const foreground = '#d0d0d0', background = '#1e1e1e';
function convert(input, caption, fragment) {
  let state;
  const reset = () => { state = { fg: foreground, bg: background, bold: false, dim: false, underline: false, reverse: false }; };
  reset();
  function sgr(sequence) {
    const codes = sequence.split(';').map(Number);
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === 0) reset();
      else if (code === 1) state.bold = true;
      else if (code === 2) state.dim = true;
      else if (code === 4) state.underline = true;
      else if (code === 7) state.reverse = true;
      else if (code === 22) state.bold = state.dim = false;
      else if (code === 24) state.underline = false;
      else if (code === 27) state.reverse = false;
      else if (code === 39) state.fg = foreground;
      else if (code === 49) state.bg = background;
      else if (code >= 30 && code <= 37) state.fg = palette[code - 30];
      else if (code >= 90 && code <= 97) state.fg = palette[code - 90 + 8];
      else if (code >= 40 && code <= 47) state.bg = palette[code - 40];
      else if (code >= 100 && code <= 107) state.bg = palette[code - 100 + 8];
      else if (code === 38 || code === 48) {
        const mode = codes[++i], count = mode === 5 ? 1 : mode === 2 ? 3 : 0;
        const values = codes.slice(i + 1, i + 1 + count);
        if (count && values.length === count && values.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
          state[code === 38 ? 'fg' : 'bg'] = mode === 5 ? colour(values[0]) : rgb(values);
        }
        i += count;
      }
    }
  }
  function text(value) {
    if (!value) return '';
    const fg = state.reverse ? state.bg : state.fg, bg = state.reverse ? state.fg : state.bg;
    return `<span style="color:${fg};background:${bg}${state.bold ? ';font-weight:bold' : ''}${state.dim ? ';opacity:0.5' : ''}${state.underline ? ';text-decoration:underline' : ''}">${escape(value)}</span>`;
  }
  // Consume CSI, OSC and control strings as units so their payloads cannot appear as screen text.
  const escapes = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[PX^_][\s\S]*?\x1b\\|[ -/]*[0-~])|[\x00-\x08\x0b-\x1f\x7f]/g;
  input = input.replace(/\r\n/g, '\n').replace(/\n$/, '');
  const lines = [];
  let html = '', end = 0;
  const finishLine = () => { lines.push(`<span style="display:block;min-height:1.25em">${html}</span>`); html = ''; };
  function append(value) {
    for (const [index, part] of value.split('\n').entries()) {
      if (index) finishLine();
      html += text(part);
    }
  }
  for (const match of input.matchAll(escapes)) {
    append(input.slice(end, match.index));
    if (/^\x1b\[[\d;]*m$/.test(match[0])) sgr(match[0].slice(2, -1));
    end = match.index + match[0].length;
  }
  append(input.slice(end));
  finishLine();
  const pre = `<pre style="font-family:monospace;font-variant-ligatures:none;font-size:14px;line-height:1.25;white-space:pre;color:${foreground};background:${background};padding:16px;margin:0;width:max-content">${lines.join('')}${caption === undefined ? '' : `<span style="display:block;margin-top:1em;white-space:normal">${escape(caption)}</span>`}</pre>`;
  return fragment ? pre + '\n' : `<!doctype html>\n<html lang="en"><meta charset="utf-8"><title>Terminal capture</title><body style="margin:0;background:${background}">${pre}</body></html>\n`;
}
function main(args) {
  if (args.length === 1 && args[0] === '--help') { process.stdout.write(usage); return; }
  let source, out, caption, fragment = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--fragment') fragment = true;
    else if (arg === '-o' || arg === '--caption') {
      check(args.length > 0 && !args[0].startsWith('-'));
      if (arg === '-o') out = args.shift(); else caption = args.shift();
    } else { check(source === undefined && (arg === '-' || !arg.startsWith('-'))); source = arg; }
  }
  check(source !== undefined);
  const html = convert(readFileSync(source === '-' ? 0 : source, 'utf8'), caption, fragment);
  if (out !== undefined) writeFileSync(out, html); else process.stdout.write(html);
}
try { main(process.argv.slice(2)); } catch (error) {
  console.error(`ansi-html: ${error.message}`);
  process.exitCode = error.code === 2 ? 2 : 1;
}
