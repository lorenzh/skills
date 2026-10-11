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

const PATTERNS = [
  ['home-path', /(?:\/home\/|\/Users\/|[A-Za-z]:\\Users\\)(?!<|\$|\{|user\b|you\b|me\b)[\w.-]+/g, 'replace with ~ or a neutral path'],
  ['tmp-path', /\/(?:tmp|private\/var\/folders|var\/folders)\/[\w.-]*(?:claude|codex|scratch|tmp\.)[\w.\/-]*/g, 'drop the local scratch path'],
  ['token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|sk-(?:live-|proj-|ant-)?[A-Za-z0-9_-]{20,}|xox[abpr]-[\w-]{10,}|AKIA[0-9A-Z]{16}|AIza[\w-]{30,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})/g, 'remove it, and rotate it if real'],
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, 'remove it, and rotate it'],
  ['secret-assign', /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|_KEY)\s*=\s*(?!<|\$|\*|x{3})["']?[^\s"'<]{8,}/g, 'replace the value with a placeholder'],
  ['email', /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/gi, 'remove it, unless it is a public noreply address'],
  ['private-ip', /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/g, 'remove the internal address'],
  ['internal-host', /\b[\w-]+(?:\.[\w-]+)*\.(?:internal|corp|intranet|lan|local)\b/gi, 'remove the internal host or URL'],
  ['user-at-host', /\b[a-z_][\w-]*@[\w-]+(?:\.[\w-]+)*:[~\/]/g, 'set a neutral prompt (PS1)'],
  ['session-id', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'drop the id unless it is public'],
];
const DEFAULT_ALLOW = [/noreply/i, /@(?:[\w-]+\.)?example\.(?:com|org|net)\b/i, /^git@/, /\/(?:home|Users)\/(?:runner|user|username|USER|example)\b/];

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
function fail(msg) { console.error(`scan.mjs: ${msg}\n\n${USAGE}`); process.exit(2); }

const split = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function denyWords(opts) {
  const words = [...opts.deny, ...split(process.env.PUBLISH_DENY)];
  const file = process.env.PUBLISH_DENY_FILE || join(homedir(), '.config', 'publish-deny.txt');
  if (existsSync(file)) words.push(...readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
  return words;
}

function* files(p) {
  if (p === '-') { yield ['-', readFileSync(0, 'utf8')]; return; }
  if (!existsSync(p)) fail(`no such file: ${p}`);
  if (statSync(p).isDirectory()) {
    for (const e of readdirSync(p)) if (e !== '.git' && e !== 'node_modules') yield* files(join(p, e));
    return;
  }
  const buf = readFileSync(p);
  if (buf.subarray(0, 8000).includes(0)) return; // binary: images and video need a visual check
  yield [p, buf.toString('utf8')];
}

const ANSI = /\x1b\[[0-?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07|\x1b[()][\w]/g;
function lines(name, text) {
  const raw = text.split('\n');
  if (!name.endsWith('.cast')) return raw;
  return raw.map((l) => { try { const e = JSON.parse(l); return Array.isArray(e) ? String(e[2]).replace(ANSI, '') : l; } catch { return l; } });
}

export function scan(name, text, deny = [], allow = []) {
  const rules = [...PATTERNS];
  if (deny.length) rules.push(['deny-list', new RegExp(deny.map(escape).join('|'), 'gi'), 'remove or generalize it']);
  const allowRx = [...DEFAULT_ALLOW, ...allow];
  const out = [];
  lines(name, text).forEach((line, i) => {
    for (const [kind, rx, fix] of rules) {
      for (const m of line.matchAll(rx)) {
        if (allowRx.some((a) => a.test(m[0]))) continue;
        out.push({ file: name, line: i + 1, kind, match: m[0], fix });
      }
    }
  });
  return out;
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
