import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/slideshow.mjs', import.meta.url));
const FF = process.env.FFMPEG || 'ffmpeg';
const PROBE = FF.replace(/ffmpeg$/, 'ffprobe');
const ff = (...a) => { const r = spawnSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r; };
const hasFF = spawnSync(FF, ['-version']).status === 0;

// Fixture: two sine sections (2 s, 3 s) and three solid-colour stills; no binary files in the repo.
function fixture(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'slideshow-'));
  ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', join(dir, '01.wav'));
  ff('-f', 'lavfi', '-i', 'sine=frequency=330:duration=3', join(dir, '02.wav'));
  for (const col of ['red', 'lime', 'blue']) ff('-f', 'lavfi', '-i', `color=c=${col}:s=640x360`, '-frames:v', '1', join(dir, `${col}.png`));
  const show = { sections: ['01.wav', '02.wav'], gap: 1.5, loudness: -27, fade: 0.8,
    images: [{ src: 'red.png' }, { src: 'lime.png' }, { src: 'blue.png', at: 5.5 }], out: 'show.mp4', ...extra };
  writeFileSync(join(dir, 'show.json'), JSON.stringify(show));
  return dir;
}
const run = (dir, ...a) => spawnSync(process.execPath, [SCRIPT, join(dir, 'show.json'), ...a], { encoding: 'utf8' });
const pixel = (file, t) => [...spawnSync(FF, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']).stdout];

test('timeline: sections joined with the gap, dissolves finish on the cues', { skip: !hasFF }, () => {
  const r = run(fixture(), '--dry-run');
  assert.equal(r.status, 0, r.stderr);
  const [plan, audio, video] = r.stdout.trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(plan, { total: 6.5, sectionStarts: [0, 3.5], cues: [0, 3.5, 5.5], xfadeOffsets: [2.7, 4.7] });
  assert.match(audio.join(' '), /apad=pad_dur=1\.5.*loudnorm=I=-27:TP=-3.*afade=t=out:st=4\.5:d=2/);
  // clip lengths: slot + incoming fade overlap
  assert.deepEqual(video.filter((_, i) => video[i - 1] === '-t'), ['3.5', '2.8', '1.8']);
  assert.match(video.join(' '), /zoompan=z='1\+0\.06\*on\/88'.*zoompan=z='1\.06-0\.06\*on\/70'.*xfade=transition=fade:duration=0\.8:offset=2\.7/);
});

test('render: length, colours at the cues, loudness near target', { skip: !hasFF }, () => {
  const dir = fixture();
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  const out = join(dir, 'show.mp4');
  const dur = parseFloat(spawnSync(PROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout);
  assert.ok(Math.abs(dur - 6.5) < 0.15, `duration ${dur}`);
  assert.ok(statSync(out).size > 0);
  const [r0, g0] = pixel(out, 1); assert.ok(r0 > 200 && g0 < 60, `red at 1 s: ${r0},${g0}`);
  const [, g1] = pixel(out, 3.6); assert.ok(g1 > 200, `lime at 3.6 s: ${g1}`);
  const [, , b2] = pixel(out, 6); assert.ok(b2 > 200, `blue at 6 s: ${b2}`);
  const sum = spawnSync(FF, ['-hide_banner', '-i', join(dir, 'show.mp4.narration.wav'), '-af', 'loudnorm=print_format=summary', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const lufs = parseFloat(/Input Integrated:\s+(-?[\d.]+)/.exec(sum)[1]);
  assert.ok(Math.abs(lufs + 27) < 2.5, `loudness ${lufs}`);
});

test('misuse: missing loudness and a cue inside the previous fade exit 2', { skip: !hasFF }, () => {
  const dir = fixture({ loudness: undefined });
  assert.match(run(dir).stderr, /loudness/);
  assert.equal(run(dir).status, 2);
  const r = run(fixture({ images: [{ src: 'red.png' }, { src: 'lime.png', at: 3 }, { src: 'blue.png', at: 3.5 }] }), '--dry-run');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cues must rise/);
});
