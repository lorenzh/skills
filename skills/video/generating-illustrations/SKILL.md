---
name: generating-illustrations
description: >
  Illustration sets in one consistent style, generated with the Codex CLI image tool.
  Use when users ask for "one image per paragraph", "Bilder zu jeder Szene", or illustrations for a story, script or video.
  Use when images must share one style and the same recurring characters.
  Use when users want a style sheet or character sheet before generating scene images.
---

# Generating Illustrations

Produce one finished image per paragraph or scene, all in one approved style with the same characters, checked before handover.

**Approve one style anchor first, pass it to every image, and look at every result before handing it over.**

Requires the Codex CLI with an image tool, `jq`, and `ffmpeg` for the contact sheet.
Work in `<scratch>/illustrations/`; keep one brief, result and log file per image.
Generated images are AI content; check the target platform's disclosure rules before publishing.

## 1. Pick the model

Take the model name from the live list, never from memory:

```sh
CODEX_HOME="$(mktemp -d)" codex debug models 2>/dev/null | jq -r '.models[] | select(.visibility=="list") | .slug'
```

Keep `2>/dev/null`; stderr noise breaks `jq` without it.
If a run fails with 401 or a revoked refresh token, ask the user to log in again with the `codex` TUI device-code flow; the user does the browser part. Then rerun.
Done when one listed model name is recorded.

## 2. Make the style anchor

Write one short style paragraph, for example woodcut for a documentary or soft watercolour for a child's story.
Generate one style-anchor image: a character sheet showing every recurring character in that style.
Show the image to the user. Do not generate scene images before the user approves it.
If the user rejects it, change the style paragraph and regenerate.
Done when the user has approved `<scratch>/illustrations/anchor.png` and the style paragraph is saved.

## 3. Write one brief per image

Write `brief-NN.md` for each paragraph or scene. Each brief contains:

- The style paragraph, verbatim and identical in every brief.
- The scene: who is in it, where, each figure's pose, and the light.
- The output: an absolute path such as `<scratch>/illustrations/scene-NN.png`.
- Ask the model to state which model it is, to use its image tool, and to save to that path.
- Ask it to say plainly if it has no image tool, instead of drawing with code.

Generate each scene as one whole, finished image with all figures in it.
Never compose scenes from separate cut-out sprites on green chroma key with 2D animation; placement was imprecise and figures floated beside objects.
If a figure must sit precisely in a scene, such as in a bed or on an object, state it in the brief. For bed scenes, write that the figure lies in the bed under the blanket.
Done when one brief file exists per scene.

## 4. Run the briefs in parallel

Start one background job per brief (for example with `run_in_background`):

```sh
codex exec -i <scratch>/illustrations/anchor.png -m <model> -c model_reasoning_effort=low \
  -s workspace-write --skip-git-repo-check -o result-NN.txt - < brief-NN.md > log-NN.txt 2>&1
```

About 10 images take a few minutes. Wait for all jobs to end.
If a result says the model has no image tool, stop and report it; do not accept code-drawn images.
Done when every job has ended and each `scene-NN.png` exists or its failure is noted from `result-NN.txt`.

## 5. Check the contact sheet

Build a contact sheet with ffmpeg; Pillow may be missing. For four images:

```sh
ffmpeg -i scene-01.png -i scene-02.png -i scene-03.png -i scene-04.png -filter_complex \
  "[0]scale=480:-1[a];[1]scale=480:-1[b];[2]scale=480:-1[c];[3]scale=480:-1[d];[a][b]hstack[t];[c][d]hstack[u];[t][u]vstack" sheet.png
```

Look at the sheet yourself. Check style match with the anchor, recurring characters, the scene content from each brief, and figure placement.
Regenerate each failed image with a changed brief, at most 2 times per image. Then report it as failed.
Done when the sheet shows every image passing, or the remaining failures are listed with their reason.

## Example

Input: a child's story with 8 paragraphs and two recurring characters.
Action: the user approves a watercolour character sheet; 8 briefs run in parallel with `-i anchor.png`.
Result: the contact sheet shows scene 6 with the child beside the bed; its brief now says "lies in the bed under the blanket", and the regenerated image passes.
