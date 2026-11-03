import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (name) => readFileSync(fileURLToPath(new URL(`../templates/${name}`, import.meta.url)), 'utf8');
const md = read('report.md.tmpl');
const html = read('report.html.tmpl');

const placeholders = (s) => [...new Set([...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].sort();
const sections = (s) => [...s.matchAll(/<!-- section: ([\w-]+) -->/g)].map((m) => m[1]);

const ORDER = ['header', 'one-minute', 'ci', 'criteria', 'needs-fix', 'should-fix', 'can-fix', 'legacy', 'checked', 'not-checked', 'rereview', 'run', 'verdict'];

test('both templates list the sections in the fixed order', () => {
  assert.deepEqual(sections(md), ORDER);
  assert.deepEqual(sections(html), ORDER);
});

test('both templates use the same placeholder names', () => {
  assert.deepEqual(placeholders(html), placeholders(md));
});

test('both templates end with the verdict section and the verdict word', () => {
  assert.match(md.trimEnd(), /<!-- section: verdict -->\n## VERDICT: \{\{verdict_upper\}\}\n[\s\S]*\n\{\{verdict\}\}$/);
  assert.match(html, /<!-- section: verdict -->\s*<section class="verdict-box verdict-fix">[\s\S]*<p class="last">\{\{verdict\}\}<\/p>\s*<\/section>\s*<\/main>\s*$/);
});

test('the html template defines all three verdict classes in light and both dark token sets', () => {
  for (const cls of ['fix', 'sug', 'ok']) {
    const defs = html.match(new RegExp(`--v${cls}-bg:`, 'g')) ?? [];
    assert.equal(defs.length, 3, `--v${cls}-bg defined in :root, the dark media block and [data-theme=dark]`);
  }
  for (const cls of ['verdict-fix', 'verdict-suggest', 'verdict-ok']) assert.match(html, new RegExp(`\\.${cls}\\{`));
});

test('no emoji in either template', () => {
  for (const s of [md, html]) assert.doesNotMatch(s, /\p{Extended_Pictographic}/u);
});
