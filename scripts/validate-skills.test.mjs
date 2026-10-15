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
  write('evals/results/out.txt', '/home/bob/x');
  const ok = run();
  assert.equal(ok.status, 0, ok.stdout);
  const hits = {
    'evals/agents/sample/a.txt': ['cd /home/bob/projects', '/home/bob'],
    'evals/agents/sample/b.txt': ['cat /Users/bob/x', '/Users/bob'],
    'evals/agents/sample/c.txt': ['cd /home/user-admin2/src', '/home/user-admin2'],
    'evals/agents/sample/d.txt': ['ls /home/runnerx', '/home/runnerx'],
    'evals/agents/sample/e.txt': ['ls /home/alice.smith/x', '/home/alice.smith'],
    'evals/agents/sample/f.txt': ['type D:\\Users\\bob\\x', 'D:\\Users\\bob'],
    'evals/agents/sample/f2.txt': ['dir c:\\users\\bob', 'c:\\users\\bob'],
    'evals/agents/sample/f3.txt': ['dir C:\\USERS\\bob', 'C:\\USERS\\bob'],
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

// Fake secrets are split so this file holds no literal match for repo secret scanners.
test('rejects likely secrets by file:line and rule, never printing the value', (t) => {
  const { write, run } = fixture(t);
  write('skills/agents/sample/SKILL.md', markdown());
  const a36 = 'A1b2C3d4E5'.repeat(3) + 'F6g7H8';
  const hits = {
    'skills/agents/sample/gh.md': ['gh' + 'p_' + a36, 'github-token'],
    'skills/agents/sample/gho.md': ['x gh' + 'o_' + a36, 'github-token'],
    'skills/agents/sample/pat.md': ['github' + '_pat_' + '11ABCDEFG0abcdefghijkl_xyz', 'github-token'],
    'evals/agents/sample/sk.txt': ['key sk' + '-ant-api03-' + 'Zq9Xw8Vu7Ts6Rr5Qp4Oo3', 'sk-key'],
    'evals/agents/sample/aws.txt': ['id AK' + 'IA' + 'Q3EGRT7PWX2LMN4K', 'aws-access-key'],
    'evals/agents/sample/slack.txt': ['xo' + 'xb-' + '1234567890-abc', 'slack-token'],
    'evals/agents/sample/pem.txt': ['-----BEGIN RSA ' + 'PRIVATE KEY-----', 'private-key'],
    'evals/agents/sample/env.txt': ['ok\nDB_PASS' + 'WORD="Tr0ub4dor&3horse9staple"', 'secret-assignment'],
    'evals/agents/sample/c.json': ['{"api' + 'Key": "q8W2e4R6t8Y0u2I4o6P8"}', 'secret-assignment'],
  };
  for (const [file, [text]] of Object.entries(hits)) write(file, text);
  const r = run();
  assert.equal(r.status, 1);
  for (const [file, [text, rule]] of Object.entries(hits)) {
    const line = text.includes('\n') ? 2 : 1;
    assert.ok(r.stdout.includes(`${file}:${line}: [${rule}] likely secret`), file + '\n' + r.stdout);
    assert.ok(!r.stdout.includes(text.split('\n').pop().slice(-12)), 'value printed: ' + file);
  }
});

test('allows secret placeholders and the checking-before-publishing scanner and fixtures', (t) => {
  const { root, write, run } = fixture(t);
  write('skills/agents/sample/SKILL.md', markdown() + [
    'API_KEY=<your-api-key-goes-here>', 'token: ${{ secrets.GITHUB_TOKEN }}', 'export SECRET=$MY_LONG_SECRET_VARIABLE',
    'password = "xxxxxxxxxxxxxxxxxxxx"', 'api_key: ****************', 'TOKEN=…', 'TOKEN=...........................',
    'secret: short', 'Rotate the token: it may sit in git history.', 'gh' + 'p_tooShort', '',
  ].join('\n'));
  fs.cpSync(new URL('../skills/publishing/checking-before-publishing/', import.meta.url),
    path.join(root, 'skills/publishing/checking-before-publishing'), { recursive: true });
  const r = run();
  assert.doesNotMatch(r.stdout, /likely secret/, r.stdout);
  assert.equal(r.status, 0, r.stdout);
});

const scanSecret = (t, line) => {
  const { write, run } = fixture(t);
  write('skills/agents/sample/SKILL.md', markdown());
  write('evals/agents/sample/x.txt', line + '\n');
  return run();
};

test('redacts a secret in a sentence-length warning (R4-01)', (t) => {
  const { write, run } = fixture(t);
  const value = 'Zq9Xw8Vu7Ts6' + 'Rr5Qp4Oo3Nn2';
  write('skills/agents/sample/SKILL.md', markdown() + Array(30).fill('word').join(' ') + ' to' + 'ken=' + value + '.\n');
  const r = run();
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /\[sentence-length\].*\[redacted\]/, r.stdout);
  assert.ok(!r.stdout.includes(value), r.stdout);
});

test('allows only the exact fixture secret, not a longer value holding it (R4-02)', (t) => {
  const r = scanSecret(t, 'pass' + 'word=yourActual' + 'Password123-Production2026');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /x\.txt:1: \[secret-assignment\] likely secret/);
});

test('checks every match on a line, not only the first (R4-03)', (t) => {
  const r = scanSecret(t, 'PASS' + 'WORD=yourActual' + 'Password123 TO' + 'KEN=Zq9Xw8Vu7Ts6' + 'Rr5Qp4Oo3');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /x\.txt:1: \[secret-assignment\] likely secret/);
});

test('rejects an AWS temporary access key id (R4-04)', (t) => {
  const r = scanSecret(t, 'id AS' + 'IA' + 'Q3EGRT7PWX2LMN4K');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /x\.txt:1: \[aws-access-key\] likely secret/);
});

test('allows expression references and regex syntax as assignment values (R4-05)', (t) => {
  const r = scanSecret(t, ['token: process.env.GITHUB_TOKEN', '/token=[A-Za-z0-9_-]{32}/',
    'api_key = os.environ["OPENAI_API_KEY_VALUE"]', 'secret: "${{ secrets.DEPLOY_SECRET }}"'].join('\n'));
  assert.doesNotMatch(r.stdout, /likely secret/, r.stdout);
  assert.equal(r.status, 0, r.stdout);
});

test('reads an unquoted value through a backslash and redacts all of it (R5-01)', (t) => {
  const r = scanSecret(t, 'pass' + 'word=R7p\\!X9vT2' + 'mQ4sN6kP8w');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /x\.txt:1: \[secret-assignment\] likely secret/);
  const { write, run } = fixture(t);
  write('skills/agents/sample/SKILL.md', markdown() + Array(30).fill('word').join(' ') + ' to' + 'ken=Zq9Xw8Vu7Ts6' +
    'Rr5Qp4\\!Secret' + 'Suffix.\n');
  const w = run();
  assert.match(w.stdout, /\[sentence-length\].*\[redacted\]/, w.stdout);
  assert.ok(!w.stdout.includes('Suffix'), w.stdout);
});

test('flags brackets and braces in a quoted value outside regex context (R5-02)', (t) => {
  for (const line of ['pass' + 'word="River[Blue]' + '2026!Secret"', 'pass' + 'word="River{42}' + 'Blue2026!"']) {
    const r = scanSecret(t, line);
    assert.equal(r.status, 1, line + '\n' + r.stdout);
    assert.match(r.stdout, /x\.txt:1: \[secret-assignment\] likely secret/);
  }
});

test('flags a regex-like escape in a quoted value outside regex context (R6-01)', (t) => {
  const r = scanSecret(t, 'pass' + 'word="River\\d+' + 'Blue2026!Secret"');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /x\.txt:1: \[secret-assignment\] likely secret/);
});

test('allows quantified classes without a range inside RegExp, re and grep calls (R6-02)', (t) => {
  for (const line of ['new RegExp("to' + 'ken=[ABCDEFGHJKLMNPQRSTUVWXYZ]{32}")', 'RegExp(\'to' + 'ken=[ABCDEFGHJKLMNPQRSTUVWXYZ]{32}\')',
    're.compile(r"to' + 'ken=[A-Z]{32}")', 're.findall(r"api_' + 'key=\\w{24,}", s)', "grep -nE 'pass" + "word=[A-Za-z0-9]{20,}' .env"]) {
    const r = scanSecret(t, line);
    assert.doesNotMatch(r.stdout, /likely secret/, line + '\n' + r.stdout);
    assert.equal(r.status, 0, line + '\n' + r.stdout);
  }
});

test('reads an unquoted value through literal \\r and \\n escapes and redacts all of it (R6-03)', (t) => {
  const r = scanSecret(t, 'PASS' + 'WORD=River\\nBlue' + '2026!Secret');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /x\.txt:1: \[secret-assignment\] likely secret/);
  const { write, run } = fixture(t);
  write('skills/agents/sample/SKILL.md', markdown() + Array(30).fill('word').join(' ') + ' to' + 'ken=Zq9Xw8Vu7Ts6' +
    'Rr5Qp4\\nSecret' + 'Suffix.\n');
  const w = run();
  assert.match(w.stdout, /\[sentence-length\].*\[redacted\]/, w.stdout);
  assert.ok(!w.stdout.includes('Suffix'), w.stdout);
});

test('ends an unquoted value at a literal escape only after an exact fixture secret (R6-03)', (t) => {
  const ok = scanSecret(t, ['[31.5, "o", "$ export API_TO' + 'KEN=gh' + 'p_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8\\r\\n"]',
    "printf 'TO" + 'KEN=secret-do' + "-not-copy\\nDB_URL=postgres://localhost/dev\\n'"].join('\n'));
  assert.equal(ok.status, 0, ok.stdout);
  const r = scanSecret(t, "printf 'TO" + 'KEN=secret-do' + '-not-copy\\nPASS' + "WORD=River2026Blue!Secret\\n'");
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /x\.txt:1: \[secret-assignment\] likely secret/);
});

test('matches a quoted value through its closing quote, spaces included (R4-06)', (t) => {
  const r = scanSecret(t, 'pass' + 'word="correct horse ' + 'battery staple"');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /x\.txt:1: \[secret-assignment\] likely secret/);
  assert.ok(!r.stdout.includes('battery'), r.stdout);
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
  write('skills/agents/sample/SKILL.md', markdown('sample', 'I can help.') + '\n'.repeat(301));
  write('skills/agents/sample/references/unlinked.md', '# Reference');
  write('skills/agents/empty/.gitkeep');
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  for (const warning of [/too short/, /no trigger/, /not third person/, /soft ceiling/, /not linked/, /has no SKILL.md/])
    assert.match(r.stdout, warning);
});

const ignoredBody = (text) => `\n\`\`\`md\n${text}\n\`\`\`\n~~~md\n${text}\n~~~\n` +
  text.split('\n').map((line) => `\`\`${line}\`\`\n| ${line} | ignored |\n`).join('');

for (const [rule, positive, negative] of [
  ['step-done-when', '## 1. First\nRead it.\n### Detail\nNo outcome.\n## 2. Next\nDone when saved.\n### 3. Third\nRead it.\n## End\nDone when saved.',
    '## 1. First\n### Detail\nDone when saved.\n## 2. Next\nDone when saved.\n### 3. Third\nDone when saved.'],
  ['bounded-loop', 'Repeat the check.\nWait UNTIL ready.\nRepeat `a | b` then stop.\nOn failure: repeat the check.',
    'Repeat at most 3 times. Wait until 2 checks pass. Repeated checks are fine. Until now, 1 check passed. The summary does not repeat them. Leave it empty until the workflow starts.'],
  ['sentence-length', Array(31).fill('word').join(' ') + '.', '**' + Array(30).fill('word').join(' ') + '.** A short sentence.'],
  ['harness-name', 'Claude Code, Codex and AskUserQuestion.', 'Read the harness notes.'],
]) {
  test(`${rule} warns on prose and ignores excluded content`, (t) => {
    const { write, run } = fixture(t);
    if (rule === 'harness-name') {
      write('skills/agents/sample/references/harness-notes.md', positive);
    }
    // Frontmatter is excluded even when it contains warning candidates.
    const doc = markdown('sample', description + ' Repeat until ready. Codex. ' + Array(31).fill('word').join(' ') + '.');
    write('skills/agents/sample/SKILL.md', doc + positive + '\n');
    const hit = run();
    assert.equal(hit.status, 0, hit.stdout + hit.stderr);
    const count = { 'step-done-when': 2, 'bounded-loop': 4, 'sentence-length': 1, 'harness-name': 3 }[rule];
    assert.equal(hit.stdout.split(`[${rule}]`).length - 1, count, hit.stdout);
    write('skills/agents/sample/SKILL.md', doc + negative + ignoredBody(positive) + '\nExample | Notes\n--- | ---\n' + positive.split('\n').map((line) => `${line} | ignored`).join('\n'));
    const clean = run();
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    assert.ok(!clean.stdout.includes(`[${rule}]`), clean.stdout);
    if (rule === 'harness-name') {
      write('skills/agents/other/SKILL.md', markdown('other') + positive);
      assert.ok(!run().stdout.includes('[harness-name]'), 'harness names need a harness-notes reference');
    }
  });
}

test('flags unfilled template slots outside code; an unfilled description fails instead of reading as XML', (t) => {
  const { write, run } = fixture(t);
  const slots = '<Instruction: fill this slot.>\nDone when <the artifact exists.>';
  write('skills/agents/sample/SKILL.md', markdown('sample', '<Identity and Use when trigger.>') + slots + '\n' + ignoredBody(slots));
  const r = run();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(r.stdout.split('[template-slot]').length - 1, 3, r.stdout);
  assert.doesNotMatch(r.stdout, /XML tag/);
});

const settingsTable = (rows) => '## Settings\n\n| Setting | Controls | Allowed values | Default |\n' +
  '| --- | --- | --- | --- |\n' + rows.map(([name, value = 'auto']) => `| ${name} | Behavior | auto | ${value} |`).join('\n') + '\n';
const resolutionStep = '## 1. Resolve settings\nPrint `settings: mode=auto (default)`.\nDone when printed.\n';

for (const [rule, positive, negative, status] of [
  ['settings-secret', settingsTable(['token', 'client-secret', 'password', 'api-key'].map((name) => [name, 'sensitive-cell-value'])) + resolutionStep,
    settingsTable(['token-env', 'client-secret-env', 'password-env', 'api-key-env', 'prefix-key'].map((name) => [name])) + resolutionStep, 1],
  ['settings-count', settingsTable(Array.from({ length: 6 }, (_, i) => [`mode-${i}`])) + resolutionStep,
    settingsTable(Array.from({ length: 5 }, (_, i) => [`mode-${i}`])) + resolutionStep, 0],
  ['settings-name', settingsTable([['Bad_Name']]) + resolutionStep,
    settingsTable([['`run-mode`']]) + resolutionStep, 0],
  ['settings-default', settingsTable([['mode', '   ']]) + resolutionStep,
    settingsTable([['mode', 'auto']]) + resolutionStep, 0],
  ['settings-order', resolutionStep + settingsTable([['mode']]),
    settingsTable([['mode']]) + resolutionStep, 0],
  ['settings-resolution', settingsTable([['mode']]) + '## 1. Resolve\nRead settings.\nDone when resolved.\n',
    settingsTable([['mode']]) + resolutionStep, 0],
]) {
  test(`${rule} detects a violation`, (t) => {
    const { write, run } = fixture(t);
    write('skills/agents/sample/SKILL.md', markdown() + positive);
    const r = run();
    assert.equal(r.status, status, r.stdout + r.stderr);
    assert.ok(r.stdout.includes(`[${rule}]`), r.stdout);
    assert.ok(!r.stdout.includes('sensitive-cell-value'), r.stdout);
  });

  test(`${rule} accepts a valid setting`, (t) => {
    const { write, run } = fixture(t);
    write('skills/agents/sample/SKILL.md', markdown() + negative);
    const r = run();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /\[settings-/);
  });
}

test('settings checks ignore tables outside Settings and fenced Settings examples', (t) => {
  const { write, run } = fixture(t);
  const invalid = settingsTable(Array.from({ length: 6 }, () => ['Secret_Key', '']));
  write('skills/agents/sample/SKILL.md', markdown() + settingsTable([['mode']]) + resolutionStep +
    '## Other\n' + invalid.replace('## Settings\n', '') + '\n```md\n' + invalid + '\n```\n');
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /\[settings-/);
  write('skills/agents/sample/SKILL.md', markdown() + '```md\n' + invalid + '\n```\n');
  assert.doesNotMatch(run().stdout, /\[settings-/);
});

test('settings parser accepts reordered columns, optional border pipes and escaped pipes', (t) => {
  const { write, run } = fixture(t);
  write('skills/agents/sample/SKILL.md', markdown() + '## Settings\n\n' +
    'Default | Allowed values | Setting | Controls\n' +
    '--- | --- | --- | ---\n' +
    'auto | auto \\| manual | run-mode | Behavior\n\n' + resolutionStep);
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /\[settings-/);
});

test('settings resolution must occur in the body, not frontmatter', (t) => {
  const { write, run } = fixture(t);
  write('skills/agents/sample/SKILL.md', markdown('sample', description + ' settings: mode=auto') + settingsTable([['mode']]));
  assert.match(run().stdout, /\[settings-resolution\]/);
  write('skills/agents/sample/SKILL.md', markdown() + settingsTable([['mode']]) +
    '```text\nsettings: mode=auto (default)\n```\n');
  assert.doesNotMatch(run().stdout, /\[settings-resolution\]/);
});

test('help exits zero without inspecting layout', (t) => {
  const { write, run } = fixture(t);
  write('skills/SKILL.md', 'invalid');
  for (const flag of ['--help', '-h']) {
    const r = run('validate-skills.mjs', [flag]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Usage: node scripts\/validate-skills.mjs/);
    assert.doesNotMatch(r.stdout, /ERROR/);
    for (const rule of ['step-done-when', 'bounded-loop', 'sentence-length', 'harness-name',
      'settings-secret', 'settings-count', 'settings-name', 'settings-default', 'settings-order', 'settings-resolution'])
      assert.ok(r.stdout.includes(rule), r.stdout);
  }
});

function scaffoldFixture(t) {
  const template = new URL('../skills/agents/writing-skills/templates/SKILL.md.tmpl', import.meta.url);
  const f = fixture(t);
  const target = path.join(f.root, 'skills/agents/writing-skills/templates/SKILL.md.tmpl');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(template, target);
  return f;
}

for (const withEvals of [false, true]) {
  test(`scaffolder fills the writing-skills skeleton ${withEvals ? 'with --evals' : 'without evals'}`, (t) => {
    const f = scaffoldFixture(t);
    const { root, run } = f;
    const r = run('new-skill.mjs', ['terminal-tools/sample-skill', ...(withEvals ? ['--evals'] : [])]);
    assert.equal(r.status, 0, r.stderr);
    const skeleton = fs.readFileSync(new URL('../skills/agents/writing-skills/templates/SKILL.md.tmpl', import.meta.url), 'utf8');
    assert.equal(fs.readFileSync(path.join(root, 'skills/terminal-tools/sample-skill/SKILL.md'), 'utf8'),
      skeleton.replaceAll('{{name}}', 'sample-skill').replaceAll('{{title}}', 'Sample Skill'));
    if (withEvals)
      assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'evals/terminal-tools/sample-skill/evals.json'), 'utf8')).skill_name, 'sample-skill');
    else assert.equal(fs.existsSync(path.join(root, 'evals')), false);
    assert.equal(run('new-skill.mjs', ['terminal-tools/sample-skill']).status, 1);
    assert.equal(run('new-skill.mjs', ['agents/sample-skill']).status, 1);
    assert.equal(fs.existsSync(path.join(root, 'skills/agents/sample-skill')), false);
  });
}

test('scaffolder misuse exits two without writing files', (t) => {
  const { root, run } = fixture(t);
  for (const args of [[], ['sample'], ['Agents/sample'], ['agents/Bad_Name'], ['agents/claude-tool'], ['agents/' + 'x'.repeat(65)], ['agents/sample/extra'], ['agents/sample/'], ['../sample'], ['/sample'], ['agents/sample', 'extra'], ['agents/sample', '--evals', '--evals'], ['agents/sample', '--unknown']]) {
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
  const r = run('new-skill.mjs', ['agents/sample', '--evals']);
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
