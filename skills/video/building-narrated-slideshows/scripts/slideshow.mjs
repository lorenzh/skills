#!/usr/bin/env node
// Builds a narrated slideshow: narration sections joined with gaps and normalized, one still per
// slot with a slow zoom, dissolves that finish on each cue, H.264/AAC MP4.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const USAGE = `usage: node slideshow.mjs <show.json> [--dry-run]

show.json (paths relative to its folder):
  { "sections": ["01.wav", "02.wav"], "gap": 1.5, "loudness": -27, "truePeak": -3, "fadeOut": 2,
    "images": [ { "src": "a.png" }, { "src": "b.png" }, { "src": "c.png", "at": 41.2 } ],
    "fade": 1, "zoom": 0.06, "size": "1280x720", "fps": 25, "crf": 23, "videoBitrate": "600k",
    "out": "show.mp4" }
  loudness   required: target integrated LUFS; ask the user (a quiet sleep-style voice: -26 to -28)
  images     one per slot. "at" = output second the dissolve finishes on (a spoken cue).
             Without "at", image i starts with section i (only when there are enough sections).
  videoBitrate  optional; replaces crf when the destination has a size limit.
  Defaults: gap 1.5, truePeak -3, fadeOut 2, fade 1, zoom 0.06, size 1280x720, fps 25, crf 23.

Prints the timeline (section starts, cues, xfade offsets) as JSON, then renders
<out> and <out>.narration.wav. --dry-run prints the timeline and the ffmpeg argument lists only.
ffmpeg: $FFMPEG, else ffmpeg on PATH; ffprobe beside it.
exit 0 done, 1 ffmpeg failed, 2 misuse or bad show.json.`;

const fail = (msg, code = 2) => { console.error(msg); process.exit(code); };
const FF = process.env.FFMPEG || 'ffmpeg';
const PROBE = FF.replace(/ffmpeg$/, 'ffprobe');
const r3 = (x) => Math.round(x * 1000) / 1000;

const [file, ...flags] = process.argv.slice(2);
if (!file || file === '--help' || file === '-h') fail(USAGE, file ? 0 : 2);
const dry = flags.includes('--dry-run');
let cfg;
try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { fail(`cannot read ${file}: ${e.message}`); }
const base = dirname(resolve(file));
const p = (f) => resolve(base, f);
const c = { gap: 1.5, truePeak: -3, fadeOut: 2, fade: 1, zoom: 0.06, size: '1280x720', fps: 25, crf: 23, out: 'show.mp4', ...cfg };
if (!Array.isArray(c.sections) || !c.sections.length) fail('show.json has no "sections" list of audio files');
if (!Array.isArray(c.images) || !c.images.length) fail('show.json has no "images" list');
if (typeof c.loudness !== 'number') fail('"loudness" (target LUFS) is required: ask the user how loud the voice should be');
if (!/^\d+x\d+$/.test(c.size)) fail(`size '${c.size}' is not <w>x<h>`);

const durOf = (f) => {
  const r = spawnSync(PROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p(f)], { encoding: 'utf8' });
  const d = parseFloat(r.stdout);
  if (r.status !== 0 || !(d > 0)) fail(`cannot read the duration of ${f}: ${r.stderr || r.error?.message || 'no duration'}`);
  return d;
};
const durs = c.sections.map(durOf);
const starts = durs.map((_, i) => durs.slice(0, i).reduce((a, d) => a + d + c.gap, 0));
const total = starts.at(-1) + durs.at(-1);

// cues[i] = output second image i is fully shown; the dissolve into it runs from cues[i] - fade.
const cues = c.images.map((im, i) => {
  if (i === 0) return 0;
  if (typeof im.at === 'number') return im.at;
  if (i >= starts.length) fail(`image ${i + 1} (${im.src}) has no section to start with: give it "at"`);
  return starts[i];
});
for (let i = 1; i < cues.length; i++) {
  if (!(cues[i] > cues[i - 1]) || cues[i] - c.fade < (i > 1 ? cues[i - 1] : 0) || cues[i] >= total)
    fail(`image ${i + 1} cue ${cues[i]} s: cues must rise, leave room for the ${c.fade} s fade and stay under ${r3(total)} s`);
}
const ends = [...cues.slice(1), total];
// Each clip covers its slot plus the incoming fade overlap (the first clip has none).
const lens = cues.map((t, i) => ends[i] - t + (i ? c.fade : 0));
const offsets = cues.slice(1).map((t) => r3(t - c.fade));
console.log(JSON.stringify({ total: r3(total), sectionStarts: starts.map(r3), cues: cues.map(r3), xfadeOffsets: offsets }));

const wav = p(c.out) + '.narration.wav';
const ain = c.sections.flatMap((f) => ['-i', p(f)]);
const parts = c.sections.map((_, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo${i < durs.length - 1 ? `,apad=pad_dur=${c.gap}` : ''}[a${i}]`);
const af = `${parts.join(';')};${c.sections.map((_, i) => `[a${i}]`).join('')}concat=n=${durs.length}:v=0:a=1,` +
  `loudnorm=I=${c.loudness}:TP=${c.truePeak}:LRA=11,aresample=48000,afade=t=out:st=${r3(Math.max(0, total - c.fadeOut))}:d=${c.fadeOut}[a]`;
const audio = ['-y', '-hide_banner', '-loglevel', 'error', ...ain, '-filter_complex', af, '-map', '[a]', wav];

const [w, h] = c.size.split('x');
const vin = c.images.flatMap((im, i) => ['-loop', '1', '-framerate', String(c.fps), '-t', String(r3(lens[i])), '-i', p(im.src)]);
const vf = c.images.map((_, i) => {
  const n = Math.max(1, Math.round(lens[i] * c.fps));
  const z = i % 2 ? `${1 + c.zoom}-${c.zoom}*on/${n}` : `1+${c.zoom}*on/${n}`; // alternate in and out
  return `[${i}:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,` +
    `zoompan=z='${z}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${w}x${h}:fps=${c.fps},format=yuv420p,setsar=1[v${i}]`;
});
let last = '[v0]';
offsets.forEach((o, k) => { vf.push(`${last}[v${k + 1}]xfade=transition=fade:duration=${c.fade}:offset=${o}[x${k + 1}]`); last = `[x${k + 1}]`; });
const n = c.images.length;
const rate = c.videoBitrate ? ['-b:v', String(c.videoBitrate), '-maxrate', String(c.videoBitrate), '-bufsize', String(c.videoBitrate)] : ['-crf', String(c.crf)];
const video = ['-y', '-hide_banner', '-loglevel', 'error', ...vin, '-i', wav, '-filter_complex', vf.join(';'),
  '-map', last, '-map', `${n}:a`, '-c:v', 'libx264', ...rate, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
  '-shortest', '-movflags', '+faststart', p(c.out)];

for (const args of [audio, video]) {
  if (dry) { console.log(JSON.stringify(args)); continue; }
  const r = spawnSync(FF, args, { stdio: 'inherit' });
  if (r.status !== 0) fail(`ffmpeg failed: ${r.error?.message ?? `exit ${r.status}`}`, 1);
}
