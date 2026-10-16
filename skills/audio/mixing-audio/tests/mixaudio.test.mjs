import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/mixaudio.py', import.meta.url));
const available = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('mixaudio operations with generated tones', { skip: available ? false : 'ffmpeg/ffprobe missing; audio checks skipped' }, () => {
  // Keep generated fixtures inside the checkout, including during cold model runs.
  const dir = mkdtempSync(join(process.cwd(), '.mixaudio-test-'));
  const path = name => join(dir, name);
  const cli = (...args) => run('python3', [script, ...args]);
  const duration = name => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path(name)]));
  const tone = (name, frequency, seconds, rate = 24000, channels = 1) => run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=${seconds}:sample_rate=${rate}`, '-ac', String(channels), path(name)]);
  try {
    tone('a.wav', 440, 2);
    tone('b.wav', 880, 2, 48000);
    const measured = cli('measure', path('a.wav'));
    assert.match(measured, /duration=2.000 s; integrated=-?[\d.]+ LUFS/);
    cli('stitch', path('a.wav'), path('b.wav'), path('a.wav'), path('b.wav'), '--gap', '0.2', '--rate', '24000', '-o', path('joined.wav'));
    assert.ok(Math.abs(duration('joined.wav') - 8.6) < 0.01);
    const normalized = cli('normalize', path('a.wav'), '--target-lufs', '-16', '-o', path('normalized.wav'));
    assert.match(normalized, /wrote /);
    assert.ok(Math.abs(Number(normalized.match(/integrated=([-\d.]+)/)[1]) + 16) <= 1);
    tone('stereo.wav', 440, 10, 48000, 2);
    const stereoNormalized = cli('normalize', path('stereo.wav'), '-o', path('stereo-normalized.wav'));
    const stereoLufs = Number(stereoNormalized.match(/integrated=([-\d.]+)/)[1]);
    assert.ok(Math.abs(stereoLufs + 16) <= 1, `stereo normalization: ${stereoLufs} LUFS, expected -16 ±1`);
    tone('source.m4a', 440, 31, 48000, 2);
    cli('trim', path('source.m4a'), '--start', '1', '--duration', '29', '-o', path('trim.wav'));
    assert.ok(Math.abs(duration('trim.wav') - 29) < 0.01);
    const stream = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', path('trim.wav')])).streams[0];
    assert.equal(stream.channels, 1);
    assert.equal(stream.codec_name, 'pcm_s16le');
    const original = readFileSync(path('a.wav'));
    const overwrite = spawnSync('python3', [script, 'clean', path('a.wav'), '-o', path('a.wav')], { encoding: 'utf8' });
    assert.equal(overwrite.status, 2);
    assert.match(overwrite.stderr, /refusing to overwrite/);
    assert.deepEqual(readFileSync(path('a.wav')), original);
    for (const args of [[], ['trim', path('a.wav'), '--duration', '-1', '-o', path('bad.wav')], ['stitch', path('a.wav'), '--gap', 'nan', '-o', path('bad.wav')], ['normalize', path('a.wav'), '--target-lufs', '0', '-o', path('bad.wav')]]) {
      assert.equal(spawnSync('python3', [script, ...args]).status, 2);
    }
    cli('clean', path('a.wav'), '-o', path('clean.wav'));
    assert.ok(Math.abs(duration('clean.wav') - 2) < 0.01);
    cli('overlay', path('a.wav'), path('b.wav'), '--offset', '1.5', '-o', path('overlay.wav'));
    assert.ok(Math.abs(duration('overlay.wav') - 3.5) < 0.01);
    cli('duck', path('a.wav'), path('b.wav'), '-o', path('duck.wav'));
    assert.ok(existsSync(path('duck.wav')));
    const raw = spawnSync('ffmpeg', ['-v', 'error', '-i', path('duck.wav'), '-t', '0.5', '-f', 'f32le', '-acodec', 'pcm_f32le', '-']).stdout;
    const samples = Array.from({ length: raw.length / 4 }, (_, i) => raw.readFloatLE(i * 4));
    function amplitude(frequency) {
      let real = 0, imag = 0;
      samples.forEach((sample, i) => {
        const phase = 2 * Math.PI * frequency * i / 48000;
        real += sample * Math.cos(phase);
        imag += sample * Math.sin(phase);
      });
      return Math.hypot(real, imag) * 2 / samples.length;
    }
    assert.ok(amplitude(440) > amplitude(880) * 5, 'voice must exceed the music bed at the start');
    const missing = spawnSync('/usr/bin/python3', [script, 'measure', path('a.wav')], { encoding: 'utf8', env: { ...process.env, PATH: dir } });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /ffmpeg is missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
