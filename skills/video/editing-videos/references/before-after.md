# Before/after comparison

Use with the process in `../SKILL.md` when a video shows what changed between two versions of a terminal app, such as an old tag and a new branch.

1. **Record both versions with one scenario.** Check out each version in its own worktree (`git worktree add .worktrees/before <old tag>`, the same for the new branch) and run one scenario script against each using an available terminal recording tool (for example tmux), each with its own tmux name and cast, same size and pauses. At each change's end state, locate a shared text anchor using an available screen inspection tool and save its `col row` for that version; the anchor is text both versions draw next to the change (a row label, the start of the status line), because added text has no position in the before version.
   If recording or screen inspection has no available skill or tool, report the missing capability and ask how to proceed.
   Done when both casts are rendered to MP4 and every change has a `col row` per version.

2. **Cut each change as a pair of beats.** The before beat, then the after beat, from the same moment of the scenario: `B3-before` (src `before.mp4`) and `B3-after` (src `after.mp4`), same `crop`, captions that name the half ("Before: …", "After: …"). Captions sit in the top band and pairs join with the short `fade`.
   Done when beats.json has a before and an after beat for every change.

3. **Box the changed cells.** Viewers miss a change nobody points at, so both beats of a pair get a `box` on the changed cells, in the before beat where the change will appear. Count the changed span from the anchor in cells (wide characters and emoji count 2) and size it to the wider of the two versions. With `b` the box line width from `edit.mjs --help`: x = pad + (col − 1) × cell width − b, y = pad + (row − 1) × cell height − b, w = cells × cell width + 2b, h = cell height + 2b (x and y at least 0), with pad and cell size measured as in step 3 of `../SKILL.md`. Set `boxAt` to a time after the change is on screen in that beat.
   Done when a frame from each clip half a second after `boxAt` (`ffmpeg -ss <boxAt + 0.5> -i clips/B3-after.mp4 -frames:v 1 frames/b3-after.png`) shows the box around the changed text, and you looked at both.

4. **Translate from the edit list.** Keep the raw takes. For another language, copy beats.json to `beats.<lang>.json`, change only `caption`, `card`, `clips` and `out`, then render `all` and `join`; spans, crops and boxes stay, and nothing is recorded again.
   Done when the translated video exists and its beat count and length match the original.

5. **Make the release GIF.** Convert the joined MP4 to a GIF about 960 px wide at 8 fps for the release notes:
   `ffmpeg -i final.mp4 -vf "fps=8,scale=960:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" final.gif`
   Keep it under 10 MB; lower the fps or width if it is larger. Embed the GIF in the notes and attach the MP4 as a release asset (`gh release upload <tag> final.mp4`): GitHub plays a video inline only when it was uploaded through its web editor.
   Done when the GIF is under 10 MB and the MP4 is attached to the release.
