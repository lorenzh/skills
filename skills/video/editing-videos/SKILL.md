---
name: editing-videos
description: Video editing workflow with ffmpeg for screen recordings and terminal captures. Use when the user asks to cut, crop, zoom or caption a recording, to turn a demo take into a square or vertical social video (X, LinkedIn, Reels, Shorts), to join clips with crossfades or add an end card, to show a change as a before/after comparison video, or to redo one part of an edited video without re-rendering the rest.
---

# Editing videos

Turn raw takes into a finished cut: one clip per beat, then one join.

**Each beat is its own clip, rendered from a source span you wrote down. A fix to one beat re-renders that clip and the join, nothing else.**

The edit list is `beats.json`; `node <skill dir>/scripts/edit.mjs --help` prints its format. Run the script rather than retyping its ffmpeg commands: it holds the filter chains (smooth zoom, caption box, even sizes, xfade offsets, faststart) that hand-written commands get wrong.

Before recording a video that compares two versions of an app (before/after, old tag against new branch), read [references/before-after.md](references/before-after.md): it changes how the takes are recorded.

## Process

1. **Check ffmpeg.** Run `ffmpeg -hide_banner -filters | grep -E 'drawtext|xfade'`. Captions and end cards need `drawtext`, and many static builds lack it. Check the system ffmpeg and any binary supplied by available recording tools. If none has both filters, download a static build into its own folder. Set `FFMPEG=<path>/ffmpeg` for the script and use the `ffprobe` beside it:
   - Linux: BtbN `ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz` (github.com/BtbN/FFmpeg-Builds, releases) has drawtext, zoompan, xfade and libx264. The johnvansickle 7.0.2 static build has no drawtext.
   - macOS: Homebrew `ffmpeg`.
   Done when the ffmpeg you will use lists `drawtext` and `xfade`.

2. **Write the edit list.** Take the beat ids from the plan (`plan.md`, if one exists). Per beat, find the source span in the take: extract frames around the action (`ffmpeg -ss 50 -t 8 -i raw.mp4 -vf fps=2 seg/%02d.png`) and look at them; write `src`, `start` and `dur` (the action plus the beat's hold). Pick `size` from the destination: 1080x1080 square for X and LinkedIn feeds, 1080x1920 vertical for Reels, Shorts and TikTok, 1920x1080 for the web and YouTube. If a plan exists, add a "Source spans" table to it, one row per beat: id, source file, span, crop.
   Done when beats.json has every beat with a span you checked on a frame.

3. **Frame each beat.** `crop` is `w:h:x:y` in source pixels: the region the beat is about, small enough that its text reads at phone size (text height at least ~2 % of the output height, tunable). For a terminal capture, derive pixels from cells: left = pad + (col − 1) × cell width, top = pad + (row − 1) × cell height; measure pad and cell size once on a frame. `zoom` is a zoompan expression on the output frame number `on`, capped so it stops: `min(1+0.3*on/30,1.3)` zooms 30 % over one second, then holds. `zoomX`/`zoomY` set the anchor (`0` left or top edge, `iw-iw/zoom` right edge, `ih-ih/zoom` bottom edge; default centre). Captions: one line of at most ~28 characters at 1080 wide; `\n` in the JSON string breaks a line. An end card is a beat with `card`, a list of lines (title first, larger), and no source. `font` is a bold .ttf: `fc-list : file | grep -i bold`.
   Done when every beat has a crop or a reason to show the full frame, and every caption fits its line.

4. **Render and look.** Run `node <skill dir>/scripts/edit.mjs beats.json all`, then extract a frame from the end of each clip (`ffmpeg -sseof -0.5 -i clips/B3.mp4 -frames:v 1 frames/b3.png`) and look at it: the end state the caption claims is visible, nothing is cut off at the crop edge, the caption box does not cover the subject. Fix one beat with `edit.mjs beats.json B3`; the other clips stay as they are.
   Done when every clip has a frame you looked at and no defect is open.

5. **Join.** Run `node <skill dir>/scripts/edit.mjs beats.json join`. It crossfades the clips in beats.json order (`fade`, default 0.3 s) into `out`: H.264, yuv420p, faststart, with a silent AAC track unless `"audio": false`. Check with `ffprobe` that the length is the sum of `dur` minus one fade per cut and the file is under the destination's size cap.
   For independently recorded takes, set `"fade": 0.2` to use a 0.2 s xfade. Place each beat's speech 0.1 s after its incoming fade ends; the first beat has no incoming fade. The helper writes silent audio; use an available audio tool to place and mux narration, or report the missing owner and ask how to proceed.
   Measure adjacent-frame mean luma differences at every join: run `ffmpeg -i final.mp4 -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG" -an -f null -` and compare values around each fade. Inspect those frames for flashes and layout jumps. One measured join changed by 26 luma units in one frame; a 0.2 s fade spread it across six frames, with steps of 3.5–7.6. These values describe that cut, not a universal limit.
   Done when the joined file exists and its length, codecs and size match the destination.

6. **Retake one beat.** When a beat's take is redone, find its new span, change only that beat's `src`, `start` and `dur`, render it, and join. If the plan's Shared state ties the beat to others (same totals, same items on screen), retake and re-render the group; a mixed group shows numbers that contradict each other.
   Done when the changed beats and the join are rendered and the other clips are untouched.

## Example: one zoomed beat and an end card

```json
{ "size": "1080x1080", "font": "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", "bg": "0x272a35",
  "out": "demo-x.mp4", "beats": [
  { "id": "B5", "src": "raw.mp4", "start": 58.9, "dur": 3.8, "crop": "1470:504:0:787",
    "zoom": "min(1+0.35*on/30,1.35)", "zoomX": "iw-iw/zoom", "caption": "What each agent costs" },
  { "id": "B8", "dur": 4.5, "card": ["Tool name", "one line on what it is", "github.com/you/tool"] } ] }
```

## References

- `node <skill dir>/scripts/edit.mjs --help`: edit list format, commands, exit codes. `node --test <skill dir>/tests/` tests it.
