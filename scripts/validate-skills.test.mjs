import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const description = 'Test skill for checking repository tooling. Use when the user asks to validate category layout, frontmatter, links or matching evaluation folders.';
const markdown = (name = 'sample', desc = description) => `---\nname: ${name}\ndescription: ${desc}\n---\n\n# Sample\n`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-validator-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'skills'));
  for (const script of ['validate-skills.mjs', 'new-skill.mjs'])
    fs.copyFileSync(new URL(script, import.meta.url), path.join(root, 'scripts', script));
  fs.cpSync(new URL('../templates/', import.meta.url), path.join(root, 'templates'), { recursive: true });
  const write = (file, text = '') => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  const run = (script = 'validate-skills.mjs', args = []) => spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], { encoding: 'utf8' });
  return { root, write, run };
}

test('discovers exactly two levels and accepts matching category evals', (t) => {
  const { write, run } = fixture(t);
  write('skills/agents/sample/SKILL.md', markdown());
  write('skills/terminal-tools/other/SKILL.md', markdown('other'));
  write('evals/agents/sample/evals.json', '{}');
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /2 skill\(s\) checked: 0 error\(s\), 0 warning\(s\)/);
});

for (const file of ['SKILL.md', 'skills/SKILL.md', 'skills/agents/SKILL.md']) {
  test(`rejects shadowing ${file}`, (t) => {
    const { write, run } = fixture(t);
    write('skills/agents/sample/SKILL.md', markdown());
    write(file, markdown());
    const r = run();
    assert.equal(r.status, 1);
    assert.match(r.stdout, /shadows every skill/);
  });
}

for (const file of ['skills/agents/sample/nested/SKILL.md', 'skills/agents/empty/nested/deeper/SKILL.md']) {
  test(`rejects deeper skill ${file}`, (t) => {
    const { write, run } = fixture(t);
    write('skills/agents/sample/SKILL.md', markdown());
    write(file, markdown('nested'));
    const r = run();
    assert.equal(r.status, 1);
    assert.match(r.stdout, /skill is deeper/);
  });
}

test('frontmatter name must equal the leaf folder', (t) => {
  const { write, run } = fixture(t);
  write('skills/agents/sample/SKILL.md', markdown('agents'));
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /name "agents" != folder name "sample"/);
});

test('rejects duplicate names across categories', (t) => {
  const { write, run } = fixture(t);
  for (const category of ['agents', 'terminal']) write(`skills/${category}/sample/SKILL.md`, markdown());
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /duplicate skill name "sample"/);
  assert.match(r.stdout, /2 skill\(s\) checked/);
});

for (const category of ['Agents', 'terminal_tools', 'terminal--tools', 'terminal-']) {
  test(`rejects category ${category} in skills and evals`, (t) => {
    const { write, run } = fixture(t);
    write(`skills/${category}/sample/SKILL.md`, markdown());
    write(`evals/${category}/sample/evals.json`, '{}');
    const r = run();
    assert.equal(r.status, 1);
    assert.equal((r.stdout.match(/category must be lowercase/g) ?? []).length, 2);
  });
}

for (const evalPath of ['evals/terminal/sample/evals.json', 'evals/agents/missing/evals.json']) {
  test(`evals must match the same category: ${evalPath}`, (t) => {
    const { write, run } = fixture(t);
    write('skills/agents/sample/SKILL.md', markdown());
    write(evalPath, '{}');
    const r = run();
    assert.equal(r.status, 1);
    assert.match(r.stdout, /matches no skill in the same category/);
  });
}

test('keeps frontmatter, description and relative-link errors', (t) => {
  const { write, run } = fixture(t);
  write('skills/agents/sample/SKILL.md', markdown('sample', '<tag>' + 'x'.repeat(1024)) + '[Missing](references/missing.md)\n');
  write('skills/agents/no-frontmatter/SKILL.md', '# No frontmatter');
  write('skills/agents/no-description/SKILL.md', '---\nname: no-description\n---\n');
  const r = run();
  assert.equal(r.status, 1);
  for (const error of [/description is 1029 chars/, /XML tag/, /links to references\/missing.md/, /missing YAML frontmatter/, /missing or empty description/])
    assert.match(r.stdout, error);
});

test('rejects local paths in skills and evals, allows placeholders and exact fixture names', (t) => {
  const { write, run } = fixture(t);
  write('skills/agents/sample/SKILL.md', markdown() + 'See /home/<user>/x, /home/jdoe/x, /home/user-admin/src, /Users/alice.meyer/x,\n' +
    '"/home/runner.dev", C:\\Users\\jdoe\\x, C:\\\\Users\\\\<user>\\\\x, /tmp/claude-1000/scratch.\n');
  write('evals/agents/sample/evals.json', '{}');
  write('evals/agents/sample/results/out.txt', '/home/bob/x');
  const ok = run();
  assert.equal(ok.status, 0, ok.stdout);
  const hits = {
    'evals/agents/sample/a.txt': ['cd /home/bob/projects', '/home/bob'],
    'evals/agents/sample/b.txt': ['cat /Users/bob/x', '/Users/bob'],
    'evals/agents/sample/c.txt': ['cd /home/user-admin2/src', '/home/user-admin2'],
    'evals/agents/sample/d.txt': ['ls /home/runnerx', '/home/runnerx'],
    'evals/agents/sample/e.txt': ['ls /home/alice.smith/x', '/home/alice.smith'],
    'evals/agents/sample/f.txt': ['type D:\\Users\\bob\\x', 'D:\\Users\\bob'],
    'evals/agents/sample/g.json': ['{"p": "C:\\\\Users\\\\bob\\\\x"}', 'C:\\\\Users\\\\bob'],
    'skills/agents/sample/h.md': ['Read /tmp/claude-1004/-home-bob-x/scratchpad/a.md', '/tmp/claude-1004/-'],
    'skills/agents/sample/results/x.txt': ['/home/bob/', '/home/bob'],
  };
  for (const [file, [text]] of Object.entries(hits)) write(file, text);
  const r = run();
  assert.equal(r.status, 1);
  for (const [file, [, hit]] of Object.entries(hits))
    assert.ok(r.stdout.includes(`${file}: local path "${hit}"`), file + '\n' + r.stdout);
});

for (const doc of ['AGENTS.md', 'README.md']) {
  test(`checks relative markdown links in ${doc}`, (t) => {
    const { root, write, run } = fixture(t);
    write('skills/terminal/sample/SKILL.md', markdown());
    write('linked file.md', '# Linked\n');
    write(doc, '[Skill](./skills/terminal/sample/SKILL.md#sample)\n' +
      '[File](<linked file.md>)\n[Reference][target]\n[target]: linked%20file.md\n' +
      '[Web](https://example.com/missing)\n[Anchor](#missing)\n' +
      '`[Code](missing.md)`\n```md\n[Example](missing.md)\n```\n');
    assert.equal(run().status, 0);
    fs.rmSync(path.join(root, 'linked file.md'));
    const r = run();
    assert.equal(r.status, 1);
    assert.match(r.stdout, new RegExp(`${doc}: links to linked file.md, which does not exist`));
    assert.match(r.stdout, /links to linked%20file.md, which does not exist/);
  });
}

test('missing skills directory reports a clear error without crashing', (t) => {
  const { root, run } = fixture(t);
  fs.rmSync(path.join(root, 'skills'), { recursive: true });
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /ERROR skills\/.*missing/);
  assert.match(r.stdout, /0 skill\(s\) checked: 1 error\(s\), 0 warning\(s\)/);
  assert.equal(r.stderr, '');
});

test('keeps name constraints', (t) => {
  const { write, run } = fixture(t);
  for (const name of ['Bad_Name', 'x'.repeat(65), 'claude-tool', 'anthropic-tool'])
    write(`skills/agents/${name}/SKILL.md`, markdown(name));
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /must be lowercase letters, digits and single hyphens/);
  assert.match(r.stdout, /name is 65 chars/);
  assert.equal((r.stdout.match(/reserved word/g) ?? []).length, 2);
});

test('warnings still exit zero', (t) => {
  const { write, run } = fixture(t);
  write('skills/agents/sample/SKILL.md', markdown('sample', 'I can help. TODO') + '\n'.repeat(301));
  write('skills/agents/sample/references/unlinked.md', '# Reference');
  write('skills/agents/empty/.gitkeep');
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  for (const warning of [/too short/, /no trigger/, /not third person/, /template's TODO/, /soft ceiling/, /not linked/, /has no SKILL.md/])
    assert.match(r.stdout, warning);
});

test('help exits zero without inspecting layout', (t) => {
  const { write, run } = fixture(t);
  write('skills/SKILL.md', 'invalid');
  for (const flag of ['--help', '-h']) {
    const r = run('validate-skills.mjs', [flag]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Usage: node scripts\/validate-skills.mjs/);
    assert.doesNotMatch(r.stdout, /ERROR/);
  }
});

test('scaffolder creates category skill and evals with leaf placeholders', (t) => {
  const { root, run } = fixture(t);
  const r = run('new-skill.mjs', ['terminal-tools/sample-skill']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(path.join(root, 'skills/terminal-tools/sample-skill/SKILL.md'), 'utf8'), /name: sample-skill\n[\s\S]*# Sample Skill/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'evals/terminal-tools/sample-skill/evals.json'), 'utf8')).skill_name, 'sample-skill');
  assert.equal(run().status, 0);
  assert.equal(run('new-skill.mjs', ['terminal-tools/sample-skill']).status, 1);
  assert.equal(run('new-skill.mjs', ['agents/sample-skill']).status, 1);
  assert.equal(fs.existsSync(path.join(root, 'skills/agents')), false);
});

test('scaffolder misuse exits two without writing files', (t) => {
  const { root, run } = fixture(t);
  for (const args of [[], ['sample'], ['Agents/sample'], ['agents/Bad_Name'], ['agents/claude-tool'], ['agents/' + 'x'.repeat(65)], ['agents/sample/extra'], ['agents/sample/'], ['../sample'], ['/sample'], ['agents/sample', 'extra']]) {
    const r = run('new-skill.mjs', args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /Usage:.*<category>\/<name>/);
  }
  assert.deepEqual(fs.readdirSync(path.join(root, 'skills')), []);
  assert.equal(fs.existsSync(path.join(root, 'evals')), false);
  assert.equal(run('new-skill.mjs', ['--help']).status, 0);
});

test('scaffolder refuses an existing eval directory before creating the skill', (t) => {
  const { root, write, run } = fixture(t);
  write('evals/agents/sample/evals.json', 'preserve');
  const r = run('new-skill.mjs', ['agents/sample']);
  assert.equal(r.status, 1);
  assert.equal(fs.existsSync(path.join(root, 'skills/agents/sample')), false);
  assert.equal(fs.readFileSync(path.join(root, 'evals/agents/sample/evals.json'), 'utf8'), 'preserve');
});

function pluginFixture(t, plugin = {}, market = {}) {
  const f = fixture(t);
  f.write('skills/agents/sample/SKILL.md', markdown());
  f.write('skills/terminal/other/SKILL.md', markdown('other'));
  f.write('skills/empty/.gitkeep');
  f.write('.claude-plugin/plugin.json', JSON.stringify({ name: 'lorenzh', skills: ['./skills/agents', './skills/terminal'], ...plugin }));
  f.write('.claude-plugin/marketplace.json', JSON.stringify({ name: 'lorenzh-skills', owner: { name: 'x' }, plugins: [{ name: 'lorenzh', source: './' }], ...market }));
  return f;
}

test('accepts plugin manifests that match the skill categories', (t) => {
  const r = pluginFixture(t).run();
  assert.equal(r.status, 0, r.stdout);
});

for (const [label, skills, error] of [
  ['missing category', ['./skills/agents'], /missing \.\/skills\/terminal/],
  ['category without skills', ['./skills/agents', './skills/terminal', './skills/empty'], /not a skill category: skills\/empty/],
  ['duplicate entry', ['./skills/agents', './skills/terminal', 'skills/agents/'], /must list each category folder that holds skills once/],
]) {
  test(`plugin.json skills must equal the skill categories: ${label}`, (t) => {
    const r = pluginFixture(t, { skills }).run();
    assert.equal(r.status, 1);
    assert.match(r.stdout, error);
  });
}

test('marketplace entry name must equal the plugin name', (t) => {
  const r = pluginFixture(t, {}, { plugins: [{ name: 'other', source: './' }] }).run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no plugin entry named "lorenzh"/);
});

for (const name of ['claude-tools', 'anthropic-tools', 'cc-plugin-tools']) {
  test(`rejects reserved plugin and marketplace name ${name}`, (t) => {
    const r = pluginFixture(t, { name }, { name, plugins: [{ name, source: './' }] }).run();
    assert.equal(r.status, 1);
    assert.equal((r.stdout.match(/reserved prefix/g) ?? []).length, 3);
  });
}

test('rejects a version in plugin.json or a marketplace plugin entry', (t) => {
  const r = pluginFixture(t, { version: '1.0.0' }, { plugins: [{ name: 'lorenzh', source: './', version: '1.0.0' }] }).run();
  assert.equal(r.status, 1);
  assert.equal((r.stdout.match(/the commit SHA is the plugin version/g) ?? []).length, 2, r.stdout);
});

for (const file of ['plugin.json', 'marketplace.json']) {
  test(`reports a missing ${file} once .claude-plugin/ exists`, (t) => {
    const f = pluginFixture(t);
    fs.rmSync(path.join(f.root, '.claude-plugin', file));
    const r = f.run();
    assert.equal(r.status, 1);
    assert.ok(r.stdout.includes(`.claude-plugin/${file}: missing`), r.stdout);
  });
}

test('reports invalid plugin JSON', (t) => {
  const { write, run } = pluginFixture(t);
  write('.claude-plugin/plugin.json', '{');
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /plugin\.json: invalid JSON/);
});

function codexFixture(t, plugin = {}, market = {}) {
  const f = pluginFixture(t);
  f.write('.codex-plugin/plugin.json', JSON.stringify({ name: 'lorenzh', version: '0.1.0', skills: './skills/', ...plugin }));
  f.write('.agents/plugins/marketplace.json', JSON.stringify({ name: 'lorenzh-skills', plugins: [{ name: 'lorenzh', source: { source: 'local', path: './' } }], ...market }));
  return f;
}

for (const [label, skills] of [['root folder', './skills/'], ['every category', ['./skills/agents', './skills/terminal']]]) {
  test(`accepts Codex manifests listing ${label}`, (t) => {
    const r = codexFixture(t, { skills }).run();
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
}

test('Codex plugin.json skills must cover every category', (t) => {
  const r = codexFixture(t, { skills: ['./skills/agents'] }).run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\.codex-plugin\/plugin\.json: "skills" .*missing \.\/skills\/terminal/);
});

test('Codex marketplace must list the plugin', (t) => {
  const r = codexFixture(t, {}, { plugins: [{ name: 'other', source: { source: 'local', path: './' } }] }).run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /marketplace\.json: no plugin entry named "lorenzh"/);
});

test('Codex plugin name must equal the Claude plugin name', (t) => {
  const r = codexFixture(t, { name: 'other' }, { plugins: [{ name: 'other', source: { source: 'local', path: './' } }] }).run();
  assert.doesNotMatch(r.stdout, /no plugin entry/);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /name "other" differs/);
});

test('reports a missing Codex marketplace once the Codex manifest exists', (t) => {
  const f = codexFixture(t);
  fs.rmSync(path.join(f.root, '.agents'), { recursive: true });
  const r = f.run();
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes('.agents/plugins/marketplace.json: missing'), r.stdout);
});
