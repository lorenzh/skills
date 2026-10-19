---
name: building-narrated-slideshows
description: Narrated slideshow builder with ffmpeg. Use when the user has a finished narration (one audio file per section) and one still image per section and wants a video from them, asks for an audio documentary, bedtime story or picture story as an MP4, wants crossfades or a slow Ken Burns zoom on stills, wants a scene change to land on a spoken word, or needs the voice quieter or the file under an upload size limit.
---

# Building Narrated Slideshows

Turn narration sections and one still per section into an MP4 with dissolves, slow zoom and a set voice loudness.

**Image changes come from audio times: section starts, or word timestamps for a spoken cue. Never guess a cue from the script text.**

This skill is for stills plus a finished voice track. If the source is a screen recording that needs cuts, crops or captions, use an available video-editing tool or skill instead. If a mixing tool for speech audio is available, it can clean or denoise sections first; this skill only joins and normalizes them.

`node <skill dir>/scripts/slideshow.mjs --help` prints the `show.json` format. Run the script rather than retyping its ffmpeg commands: it holds the gap padding, loudnorm, clip lengths and xfade offsets that hand-written chains get wrong.

## Process

1. **Collect inputs and the level.** List the section audio files in order and one image per slot. Ask the user how loud the voice should be; do not pick it alone. For a quiet sleep-style voice use `-27` LUFS (range -26 to -28) and true peak `-3`. Ask for the gap if unstated: 1.5 s for a documentary, 2 s for a bedtime story. Ask for the destination and its upload size limit.
   Done when `show.json` names every section and image, `loudness`, `gap` and `out`.

2. **Set cues.** By default image *i* starts with section *i*. If a scene change must hit a spoken word, get word timestamps with Whisper, for example the transformers pipeline `pipeline("automatic-speech-recognition", model="openai/whisper-small", return_timestamps="word")`. A timestamp from a section file is relative to that section: add the section start the script prints (`sectionStarts`). Put the result as `"at"` on the image. The dissolve finishes on the cue: xfade offset = cue − `fade`.
   Done when every image after the first has a section or an `at` cue taken from audio.

3. **Dry run.** Run `node <skill dir>/scripts/slideshow.mjs show.json --dry-run`. Read the timeline line: `total`, `sectionStarts`, `cues`, `xfadeOffsets`. If a cue lands in a gap or mid-word, fix the `at` value. Exit 2 names the bad field.
   Done when the dry run exits 0 and every cue matches the intended word or section.

4. **Render.** Run `node <skill dir>/scripts/slideshow.mjs show.json`. It writes `<out>.narration.wav`: sections joined with `apad`, then `loudnorm` and an end `afade`. Then it writes `<out>`: per image a `zoompan` of about 6 %, alternating in and out, 1280x720 at 25 fps. Dissolves are `xfade` fades of 0.8–1 s; output is H.264 crf 23, AAC 128k, `-shortest`.
   Done when the script exits 0 and both files exist.

5. **Fit the size limit.** Check the size with `ffprobe -v error -show_entries format=duration,size -of default=nw=1 <out>`. Five minutes at 1080p came out at 64–233 MB; 720p at `"videoBitrate": "600k"` came out at 23 MB and fit a 30 MiB limit. If the file is over the destination's limit, set `videoBitrate` and render again.
   Done when the size is under the limit, or the user has no limit.

6. **Check before delivering.** Measure loudness: `ffmpeg -i <out> -af loudnorm=print_format=summary -f null -`; integrated within about 1 LU of the target. Extract 2–3 frames, at a cue and near the end: `ffmpeg -ss <cue+0.2> -i <out> -frames:v 1 cue.png`. Look at each: the right image, no black frame, no stretched picture.
   Done when the report quotes duration, size and measured loudness, and names the frames you looked at.

7. **Report and stop.** Give the file path, duration, size, loudness and the frames checked. Say plainly what you did not watch or listen to, for example "I did not watch the full video". Do not upload, publish or commit the video anywhere without the user's OK, given for that destination.
   Done when the report is sent and nothing left the machine without that OK.

## Example

Two sections (2 s and 3 s), gap 1.5 s, three stills; the third must appear on a word at 5.5 s:

```json
{ "sections": ["01.wav", "02.wav"], "gap": 1.5, "loudness": -27, "fade": 0.8,
  "images": [{ "src": "a.png" }, { "src": "b.png" }, { "src": "c.png", "at": 5.5 }], "out": "show.mp4" }
```

The dry run prints `{"total":6.5,"sectionStarts":[0,3.5],"cues":[0,3.5,5.5],"xfadeOffsets":[2.7,4.7]}`. Image b dissolves in from 2.7 s and is fully shown at 3.5 s, when section 2 starts.

## References

- `node <skill dir>/scripts/slideshow.mjs --help`: `show.json` format, defaults, exit codes. `node --test <skill dir>/tests/` tests it with a generated fixture (lavfi colours and sine tones).
