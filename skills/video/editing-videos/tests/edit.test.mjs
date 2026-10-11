import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EDIT = fileURLToPath(new URL('../scripts/edit.mjs', import.meta.url));
const run = (...a) => spawnSync(process.execPath, [EDIT, ...a], { encoding: 'utf8', env: process.env });
const FONT = ['/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf'].find(existsSync) ?? '/font.ttf';

function setup(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'edit-'));
  const cfg = { size: '1080x1080', font: FONT, fade: 0.3, beats: [
    { id: 'B1', src: 'raw.mp4', start: 0.5, dur: 1.2, crop: '320:180:0:0', zoom: 'min(1+0.2*on/30,1.2)', caption: 'Hello: 50% done' },
    { id: 'B2', src: 'raw.mp4', start: 1, dur: 1, box: ['100:40:20:20'], boxAt: 0.2 },
    { id: 'B3', dur: 1, card: ['Title', 'example.com/repo'] }], ...extra };
  writeFileSync(join(dir, 'beats.json'), JSON.stringify(cfg));
  return dir;
}
const dry = (dir, what) => { const r = run(join(dir, 'beats.json'), what, '--dry-run'); assert.equal(r.status, 0, r.stderr); return r.stdout.trim().split('\n').map((l) => JSON.parse(l)); };

test('beat: crop, smooth zoompan at crop size, caption from a text file, yuv420p', () => {
  const [a] = dry(setup(), 'B1');
  const vf = a[a.indexOf('-vf') + 1];
  assert.match(vf, /crop=320:180:0:0,zoompan=z='min\(1\+0\.2\*on\/30,1\.2\)':.*:d=1:s=320x180/);
  assert.match(vf, /drawtext=.*textfile='B1\.txt'.*box=1/);
  assert.deepEqual(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 4), ['-ss', '0.5', '-t', '1.2']);
  assert.ok(a.includes('yuv420p') && a.at(-1).endsWith('/clips/B1.mp4'));
});

test('box: fades in on source pixels before crop, at boxAt seconds', () => {
  const [a] = dry(setup({ beats: [{ id: 'B1', src: 'raw.mp4', start: 0, dur: 2, crop: '320:180:0:0', box: ['80:20:10:30', '40:20:200:90'], boxAt: 0.8 }] }), 'B1');
  const vf = a[a.indexOf('-vf') + 1];
  assert.match(vf, /^fps=30,split\[a\]\[b\];\[b\]drawbox=x=10:y=30:w=80:h=20:color=0xff9f1c:t=4,drawbox=x=200:y=90:w=40:h=20:.*fade=in:st=0\.8:d=0\.3:alpha=1\[hl\];\[a\]\[hl\]overlay,crop=320:180:0:0,/);
});

test('one beat renders alone; all renders every beat', () => {
  const dir = setup();
  assert.equal(dry(dir, 'B2').length, 1);
  assert.equal(dry(dir, 'all').length, 3);
});

test('join: xfade offsets accumulate clip length minus fade; faststart; silent AAC', () => {
  const [a] = dry(setup(), 'join');
  const fc = a[a.indexOf('-filter_complex') + 1];
  assert.match(fc, /\[0:v\]\[1:v\]xfade=transition=fade:duration=0\.3:offset=0\.9\[v1\];\[v1\]\[2:v\]xfade=.*offset=1\.6\[v2\]/);
  assert.ok(a.includes('+faststart') && a.includes('anullsrc=r=48000:cl=stereo') && a.includes('[v2]'));
});

test('misuse exits 2 with the fix', () => {
  const dir = setup();
  assert.match(run(join(dir, 'beats.json'), 'B9').stderr, /unknown beat 'B9'.*B1, B2, B3/);
  assert.equal(run(join(dir, 'beats.json'), 'B9').status, 2);
  assert.match(run(join(setup({ size: '1081x1080' }), 'beats.json'), 'all').stderr, /even/);
  for (const bad of [{ beats: [{ id: '../x', dur: 1, card: ['t'] }] }, { beats: [null] }, { beats: [{ id: 'B1', dur: 1, card: 'x' }] }, { beats: [{ id: ['B1'], dur: 1, card: ['t'] }] }, { clips: 12 }, { out: 12 }, { beats: [{ id: 'B1', src: 12, start: 0, dur: 1 }] }, { font: '/x/font:demo.ttf' },
    { beats: [{ id: 'B1', src: 'raw.mp4', start: 0, dur: 1, box: '1:1:0:0' }] }, { beats: [{ id: 'B1', src: 'raw.mp4', start: 0, dur: 1, box: ['1:1:0'] }] },
    { beats: [{ id: 'B1', src: 'raw.mp4', start: 0, dur: 1, box: ['1:1:0:0'], boxAt: -1 }] },
    { beats: [{ id: 'B1', dur: 0.2, card: ['a'] }, { id: 'B2', dur: 1, card: ['b'] }] }]) {
    const r = run(join(setup(bad), 'beats.json'), 'all', '--dry-run');
    assert.equal(r.status, 2, JSON.stringify(bad) + r.stderr);
  }
  const n = mkdtempSync(join(tmpdir(), 'edit-')); writeFileSync(join(n, 'beats.json'), 'null');
  assert.equal(run(join(n, 'beats.json'), 'all').status, 2);
  assert.equal(run().status, 2);
  assert.equal(run('--help').status, 0);
});

const ff = process.env.FFMPEG || 'ffmpeg';
const filters = spawnSync(ff, ['-hide_banner', '-filters'], { encoding: 'utf8' });
const canRender = !filters.error && /\bdrawtext\b/.test(filters.stdout) && existsSync(FONT);
test('renders and joins real clips', { skip: !canRender && 'needs ffmpeg with drawtext and a bold font' }, () => {
  const dir = join(setup(), "editor's demo");
  spawnSync('mkdir', [dir]);
  spawnSync('cp', [join(dir, '..', 'beats.json'), dir]);
  spawnSync(ff, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=s=640x360:d=3:r=30', '-pix_fmt', 'yuv420p', join(dir, 'raw.mp4')]);
  for (const w of ['all', 'join']) { const r = run(join(dir, 'beats.json'), w); assert.equal(r.status, 0, r.stderr); }
  const p = spawnSync(ff.replace(/ffmpeg$/, 'ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,pix_fmt:format=duration', '-of', 'json', join(dir, 'final.mp4')], { encoding: 'utf8' });
  if (p.error) return;
  const j = JSON.parse(p.stdout);
  assert.deepEqual(j.streams.map((s) => s.codec_name), ['h264', 'aac']);
  assert.equal(j.streams[0].pix_fmt, 'yuv420p');
  assert.ok(Math.abs(j.format.duration - 2.6) < 0.15, j.format.duration);
});
