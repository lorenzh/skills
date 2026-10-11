#!/usr/bin/env node
// Renders one clip per beat from a beats.json edit list and joins the clips with crossfades.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const USAGE = `usage: node edit.mjs <beats.json> <beat id | all | join> [--dry-run]

  <beat id>  render that beat to <clips>/<id>.mp4 (e.g. B5); other clips stay as they are
  all        render every beat
  join       crossfade the clips in beats.json order into <out> (H.264 yuv420p, faststart)
  --dry-run  print the ffmpeg argument lists as JSON lines, run nothing

beats.json (paths relative to its folder):
  { "size": "1080x1080", "fps": 30, "fade": 0.3, "out": "final.mp4", "clips": "clips",
    "font": "/path/to/Sans-Bold.ttf", "bg": "0x202020", "audio": true,
    "beats": [
      { "id": "B1", "src": "raw.mp4", "start": 10.5, "dur": 3.3, "crop": "w:h:x:y",
        "zoom": "min(1+0.2*on/30,1.2)", "zoomX": "iw/2-iw/zoom/2", "zoomY": "0",
        "caption": "One line a viewer reads in time", "box": ["w:h:x:y"], "boxAt": 1 },
      { "id": "B8", "dur": 4, "card": ["Title", "subtitle", "example.com/repo"] } ] }
  size: 1080x1080 square, 1080x1920 vertical, 1920x1080 landscape. crop, zoom, zoomX, zoomY,
  caption, box, boxAt are optional; box: 4 px orange frames in source pixels that fade in boxAt s
  (default 1) into the beat; zoom is an ffmpeg zoompan expression (on = output frame number).
  audio: true adds a silent AAC track (feeds that expect one).

ffmpeg: $FFMPEG, else ffmpeg on PATH; it needs the drawtext filter (libfreetype).
exit 0 done, 1 ffmpeg failed, 2 misuse or bad beats.json.`;

const fail = (msg, code = 2) => { console.error(msg); process.exit(code); };

export function load(file) {
  let cfg;
  try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { fail(`cannot read ${file}: ${e.message}`); }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) fail('beats.json is not a JSON object');
  const base = dirname(resolve(file));
  const m = /^(\d+)x(\d+)$/.exec(cfg.size ?? '1080x1080');
  if (!m || m[1] % 2 || m[2] % 2) fail(`size '${cfg.size}' is not <even w>x<even h>, e.g. 1080x1080`);
  if (typeof cfg.font !== 'string' || !cfg.font) fail('beats.json has no "font": give the path of a bold .ttf (fc-list : file | grep -i bold)');
  const font = resolve(base, cfg.font);
  if (/['\\:,;\[\]]/.test(font)) fail(`font path '${font}' contains one of ' \\ : , ; [ ]: copy the font to a plain path`);
  for (const k of ['clips', 'out']) if (cfg[k] !== undefined && typeof cfg[k] !== 'string') fail(`"${k}" must be a path`);
  const fade = cfg.fade ?? 0.3;
  if (!(fade >= 0)) fail('"fade" must be 0 or more seconds');
  if (!Array.isArray(cfg.beats) || !cfg.beats.length) fail('beats.json has no "beats" list');
  const ids = new Set();
  for (const b of cfg.beats) {
    if (!b || typeof b !== 'object') fail('every beat must be a JSON object');
    if (typeof b.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(b.id) || ids.has(b.id)) fail(`beat id '${b.id}' is missing, repeated, or not letters, digits, - and _`);
    ids.add(b.id);
    if (!(b.dur > 0)) fail(`${b.id}: "dur" must be a positive number of seconds`);
    if (cfg.beats.length > 1 && !(b.dur > fade)) fail(`${b.id}: "dur" ${b.dur} must be longer than the fade ${fade}`);
    if (b.card !== undefined && (!Array.isArray(b.card) || !b.card.length || b.card.some((t) => typeof t !== 'string'))) fail(`${b.id}: "card" must be a list of text lines`);
    if (b.caption !== undefined && typeof b.caption !== 'string') fail(`${b.id}: "caption" must be text`);
    if (!b.card && (typeof b.src !== 'string' || !b.src || !(b.start >= 0))) fail(`${b.id}: give "src" and "start", or "card"`);
    if (b.crop && !/^\d+:\d+:\d+:\d+$/.test(b.crop)) fail(`${b.id}: crop '${b.crop}' is not w:h:x:y in pixels`);
    if (b.box !== undefined && (!Array.isArray(b.box) || !b.box.every((r) => /^\d+:\d+:\d+:\d+$/.test(r)))) fail(`${b.id}: "box" must be a list of "w:h:x:y" in source pixels`);
    if (b.boxAt !== undefined && !(b.boxAt >= 0)) fail(`${b.id}: "boxAt" must be 0 or more seconds`);
  }
  return {
    W: +m[1], H: +m[2], fps: cfg.fps ?? 30, fade, bg: cfg.bg ?? '0x202020',
    audio: cfg.audio ?? true, font, beats: cfg.beats,
    clips: resolve(base, cfg.clips ?? 'clips'), out: resolve(base, cfg.out ?? 'final.mp4'), base,
  };
}

const enc = (c) => ['-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(c.fps)];
const text = (c, file, size, y, extra = '') =>
  `drawtext=fontfile='${c.font}':textfile='${file}':fontsize=${size}:fontcolor=white:line_spacing=${Math.round(size / 5)}:expansion=none:x=(w-tw)/2:y=${y}${extra}`;

export function beatArgs(c, b) {
  const out = join(c.clips, `${b.id}.mp4`);
  const fs = Math.round(c.W * 0.057);
  if (b.card) {
    const lines = b.card.map((t, i) => ({ t, size: i ? Math.round(fs * 0.85) : Math.round(fs * 1.5) }));
    let y = Math.round(c.H / 3);
    const vf = lines.map((l, i) => {
      const f = `${b.id}.${i}.txt`;
      const s = text(c, f, l.size, y); y += Math.round(l.size * 2.2); return { f, t: l.t, s };
    });
    return { out, files: vf.map(({ f, t }) => [f, t]), args: ['-y', '-v', 'error', '-f', 'lavfi', '-i',
      `color=c=${c.bg}:s=${c.W}x${c.H}:d=${b.dur}:r=${c.fps}`, '-vf', [...vf.map((v) => v.s), 'setsar=1'].join(','),
      '-t', String(b.dur), ...enc(c), out] };
  }
  const band = b.caption ? Math.round(c.H * 0.3) : 0;
  const maxH = c.H - band - Math.round(c.H * 0.06);
  const [cw, ch] = (b.crop ?? '').split(':');
  const f = [`fps=${c.fps}`];
  if (b.box) {
    const boxes = b.box.map((r) => { const [w, h, x, y] = r.split(':'); return `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=0xff9f1c:t=4`; });
    f.push(`split[a][b];[b]${boxes.join(',')},format=yuva420p,fade=in:st=${b.boxAt ?? 1}:d=0.3:alpha=1[hl];[a][hl]overlay`);
  }
  if (b.crop) f.push(`crop=${b.crop}`);
  if (b.zoom) {
    // zoompan needs a fixed output size: keep the crop size, scale afterwards (smooth sub-pixel zoom).
    if (!b.crop) fail(`${b.id}: "zoom" needs "crop" (zoompan keeps the crop size)`);
    f.push(`zoompan=z='${b.zoom}':x='${b.zoomX ?? 'iw/2-iw/zoom/2'}':y='${b.zoomY ?? 'ih/2-ih/zoom/2'}':d=1:s=${cw}x${ch}:fps=${c.fps}`);
  }
  f.push(`scale=${c.W}:${maxH}:force_original_aspect_ratio=decrease:flags=lanczos`, 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    `pad=${c.W}:${c.H}:(ow-iw)/2:${band}+(${c.H - band}-ih)/2:color=${c.bg}`);
  const files = [];
  if (b.caption) {
    const tf = `${b.id}.txt`;
    files.push([tf, b.caption]);
    f.push(text(c, tf, fs, Math.round(band * 0.33), `:box=1:boxcolor=black@0.8:boxborderw=${Math.round(fs * 0.45)}`));
  }
  f.push('setsar=1');
  return { out, files, args: ['-y', '-v', 'error', '-ss', String(b.start), '-t', String(b.dur), '-i', resolve(c.base, b.src),
    '-vf', f.join(','), '-an', ...enc(c), out] };
}

export function joinArgs(c) {
  const ins = c.beats.flatMap((b) => ['-i', join(c.clips, `${b.id}.mp4`)]);
  const n = c.beats.length;
  let fc = '', prev = '0:v', off = 0;
  for (let i = 1; i < n; i++) {
    off += c.beats[i - 1].dur - c.fade;
    fc += `[${prev}][${i}:v]xfade=transition=fade:duration=${c.fade}:offset=${+off.toFixed(3)}[v${i}];`;
    prev = `v${i}`;
  }
  const map = n > 1 ? `[${prev}]` : '0:v';
  const audio = c.audio ? ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'] : [];
  return ['-y', '-v', 'error', ...ins, ...audio, ...(fc ? ['-filter_complex', fc.slice(0, -1)] : []), '-map', map,
    ...(c.audio ? ['-map', `${n}:a`, '-shortest', '-c:a', 'aac', '-b:a', '64k'] : []),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(c.fps), '-movflags', '+faststart', c.out];
}

function main(argv) {
  if (argv.includes('-h') || argv.includes('--help')) { console.log(USAGE); return 0; }
  const dry = argv.includes('--dry-run');
  const [file, what, ...rest] = argv.filter((a) => a !== '--dry-run');
  if (!file || !what || rest.length) fail(USAGE);
  const c = load(file);
  let jobs;
  if (what === 'join') jobs = [{ args: joinArgs(c), files: [] }];
  else if (what === 'all') jobs = c.beats.map((b) => beatArgs(c, b));
  else {
    const b = c.beats.find((x) => x.id === what);
    if (!b) fail(`unknown beat '${what}'; beats.json has ${c.beats.map((x) => x.id).join(', ')}`);
    jobs = [beatArgs(c, b)];
  }
  if (dry) { for (const j of jobs) console.log(JSON.stringify(j.args)); return 0; }
  const ff = process.env.FFMPEG?.includes('/') ? resolve(process.env.FFMPEG) : process.env.FFMPEG || 'ffmpeg';
  const probe = spawnSync(ff, ['-hide_banner', '-filters'], { encoding: 'utf8' });
  if (probe.error) fail(`${ff} not found: set FFMPEG to an ffmpeg binary (see the skill's ffmpeg note)`);
  if (!/\bdrawtext\b/.test(probe.stdout) && what !== 'join') fail(`${ff} has no drawtext filter: use a build with libfreetype (see the skill's ffmpeg note)`);
  mkdirSync(c.clips, { recursive: true });
  for (const j of jobs) {
    for (const [f, t] of j.files) writeFileSync(join(c.clips, f), t);
    // Text files are named by basename and ffmpeg runs in the clips folder, so no path reaches the filter parser.
    const r = spawnSync(ff, j.args, { stdio: 'inherit', cwd: c.clips });
    if (r.status !== 0) fail(`ffmpeg failed on ${j.args.at(-1)}`, 1);
    console.log(j.args.at(-1));
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exit(main(process.argv.slice(2)));
