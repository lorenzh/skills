#!/usr/bin/env node
// Scans text that is about to go public for private data.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const USAGE = `usage: scan.mjs [--json] [--deny <word>]... [--allow <regex>]... <file|dir|->...

Scans files, directories (recursive; skips .git, node_modules, binary files) or
stdin (-) for private data. Asciinema .cast files are scanned as decoded text.

Deny list (your own names, hosts, employers, private repos; matched case-insensitive):
  --deny <word>          repeatable
  PUBLISH_DENY           env, comma-separated
  PUBLISH_DENY_FILE      env, one word per line (default ~/.config/publish-deny.txt)
Allow list: --allow <regex>, or PUBLISH_ALLOW (comma-separated regexes).

Exit 0 clean, 1 findings, 2 misuse.`;

// [kind, regex, fix, allow]: allow lists the regexes that mark a match of that kind as public.
const PLACEHOLDER_HOME = /^(?:\/home\/|\/Users\/|[A-Za-z]:\\Users\\)(?:user|username|runner|me|you|example|USER|USERNAME)$/;
const PUBLIC_EMAIL = /^[\w.+-]+@users\.noreply\.github\.com$|^noreply@|@(?:[\w-]+\.)?example\.(?:com|org|net)$|^git@/i;
const PATTERNS = [
  ['home-path', /(?:\/home\/|\/Users\/|[A-Za-z]:\\Users\\)(?![<$*{])[\w.-]+/g, 'replace with ~ or a neutral path', [PLACEHOLDER_HOME]],
  ['tmp-path', /\/(?:tmp|private\/var\/folders|var\/folders)\/[\w.-]*(?:claude|codex|scratch|tmp\.)[\w.\/-]*/g, 'drop the local scratch path'],
  ['token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|sk-(?:live-|proj-|ant-)?[A-Za-z0-9_-]{20,}|xox[abpr]-[\w-]{10,}|AKIA[0-9A-Z]{16}|AIza[\w-]{30,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})/g, 'remove it, and rotate it if real'],
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, 'remove it, and rotate it'],
  ['secret-assign', /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|_KEY)\s*=\s*["']?(?![<$*]|x{3}|your|redacted|changeme|placeholder)[^\s"'<]{8,}/gi, 'replace the value with a placeholder'],
  ['email', /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/gi, 'remove it, unless it is a public noreply address', [PUBLIC_EMAIL]],
  ['private-ip', /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/g, 'remove the internal address'],
  ['internal-host', /\b[\w-]+(?:\.[\w-]+)*\.(?:internal|corp|intranet|lan)\b/gi, 'remove the internal host or URL'],
  ['user-at-host', /\b[a-z_][\w-]*@[\w-]+(?:\.[\w-]+)*:[~\/]/g, 'set a neutral prompt (PS1)', [/^git@/]],
  ['session-id', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'drop the id unless it is public'],
];

function parseArgs(argv) {
  const o = { json: false, deny: [], allow: [], inputs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
    else if (a === '--json') o.json = true;
    else if (a === '--deny' || a === '--allow') {
      const v = argv[++i];
      if (v === undefined) fail(`${a} needs a value`);
      o[a.slice(2)].push(v);
    } else if (a.startsWith('--')) fail(`unknown option ${a}`);
    else o.inputs.push(a);
  }
  if (!o.inputs.length) fail('no input given');
  return o;
}
function read(p) { try { return readFileSync(p); } catch (e) { fail(`cannot read ${p === 0 ? 'stdin' : p}: ${e.code || e.message}`); } }
function fail(msg) { console.error(`scan.mjs: ${msg}\n\n${USAGE}`); process.exit(2); }

const split = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function denyWords(opts) {
  const words = [...opts.deny, ...split(process.env.PUBLISH_DENY)];
  const file = process.env.PUBLISH_DENY_FILE || join(homedir(), '.config', 'publish-deny.txt');
  if (existsSync(file)) words.push(...read(file).toString('utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
  return words;
}

function* files(p) {
  if (p === '-') { yield ['-', read(0).toString('utf8')]; return; }
  if (!existsSync(p)) fail(`no such file: ${p}`);
  if (statSync(p).isDirectory()) {
    for (const e of readdirSync(p)) if (e !== '.git' && e !== 'node_modules') yield* files(join(p, e));
    return;
  }
  const buf = read(p);
  if (buf.subarray(0, 8000).includes(0)) return; // binary: images and video need a visual check
  yield [p, buf.toString('utf8')];
}

const ANSI = /\x1b\[[0-?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07|\x1b[()][\w]/g;
// Returns the text to match and, per character, the source line it came from.
// A .cast file is joined into one output stream, so a value split across events is still found.
function decode(name, text) {
  const raw = text.split('\n');
  const parts = raw.map((l, i) => {
    if (!name.endsWith('.cast')) return [l + '\n', i + 1];
    try { const e = JSON.parse(l); if (Array.isArray(e)) return [e[1] === 'o' ? String(e[2]).replace(ANSI, '') : '', i + 1]; } catch {}
    return [l + '\n', i + 1];
  });
  let out = ''; const starts = []; const lineNo = [];
  for (const [t, n] of parts) { starts.push(out.length); lineNo.push(n); out += t; }
  const lineAt = (idx) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= idx) lo = m; else hi = m - 1; } return lineNo[lo]; };
  return [out, lineAt];
}

export function scan(name, text, deny = [], allow = []) {
  const rules = [...PATTERNS];
  if (deny.length) rules.push(['deny-list', new RegExp(deny.map(escape).join('|'), 'gi'), 'remove or generalize it']);
  const [body, lineAt] = decode(name, text);
  const out = [];
  for (const [kind, rx, fix, ok = []] of rules) {
    for (const m of body.matchAll(rx)) {
      if ([...ok, ...allow].some((a) => a.test(m[0]))) continue;
      out.push({ file: name, line: lineAt(m.index), kind, match: m[0], fix });
    }
  }
  return out.sort((x, y) => x.line - y.line);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = parseArgs(process.argv.slice(2));
  let allow;
  try { allow = [...opts.allow, ...split(process.env.PUBLISH_ALLOW)].map((r) => new RegExp(r, 'i')); } catch (e) { fail(`bad --allow regex: ${e.message}`); }
  const deny = denyWords(opts);
  const found = [];
  for (const input of opts.inputs) for (const [name, text] of files(input)) found.push(...scan(name, text, deny, allow));
  if (opts.json) console.log(JSON.stringify(found, null, 2));
  else for (const f of found) console.log(`${f.file}:${f.line}: ${f.kind}: ${f.match} -> ${f.fix}`);
  process.exit(found.length ? 1 : 0);
}
