---
name: directing-videos
description: Video directing workflow for demos, screencasts, terminal tours, tutorials, launch videos and short films. Use when the user asks to plan, script, storyboard or direct a video, wants a "tour of all features", a demo or launch video, asks how long or how paced a video should be, or asks whether a recorded cut is ready to publish.
---

# Directing videos

Turn a request into a plan, hand each shot to a recorder, and review the cut against the plan.

**The plan is the contract: every promised item is in the cut at a named timestamp, or the requester agreed to drop it. A cut with an unagreed gap is not finished.**

Every number this skill uses (length, hook, hold time, idle limit, formats, captions) is in [references/numbers.md](references/numbers.md); read it before step 1. The skill directs; recording, cutting and narration belong to other skills.

## Process

1. **Brief.** Copy the template, do not retype it: `cp <skill dir>/templates/plan.md <work dir>/plan.md`. Fill Brief: audience, the one message, call to action, destination with its format, and a budget in seconds from the Length norm. Material longer than the norm for its format becomes a series: one plan per part.
   Done when every Brief line is filled.

2. **Scope.** List under Scope, one id each (`S1`, `S4a`), everything the requester expects to see, taken from the source they named (README, feature list, their own words). "All features" means every item in that source, settings and costly items included.
   Done when the Scope list matches the source item for item.

3. **Stage.** Fill Stage: fixed size, demo data with neutral names, home path and prompt, a reset command that returns to the start state, and the recorder. Run the reset twice; both runs end in the same state.
   Done when Stage is filled and the reset has run twice.

4. **Beats.** One row per idea: what is in frame, the action, the end state that proves it worked, the hold (Reading time), the text on screen. Beat 1 meets the Hook rule. Order wide before detail. A scope item you cannot show moves to Out of scope only with the requester's yes: ask, giving the reason and what showing it would cost.
   Done when `python3 <skill dir>/scripts/coverage.py plan.md` reports only `cut:` findings and the Shared state `slot:` finding that step 5 fills.

5. **Check the demo data.** Before the first take, run the reset and drive the demo to each beat's end state once. Compare the screen with the beat's end state and text on screen: every number, name and state the caption claims must be visible (a cost column at `$0.00`, a timeline where nothing ends, a caption naming a feature that never ran). Fix the data or the setup, not the caption; a take recorded on wrong data is redone whole. Under Shared state in plan.md, list the beats that show the same session state (the same totals, the same items), so they come from one take: a retake of one of them retakes the group.
   Done when every beat has a dry-run frame that shows its end state, and Shared state lists every beat group or says `none`.

6. **Hand off.** Give each recorder the plan and the beats it owns, one take per beat or short group, so a failed take is redone alone. Use available skills or tools for terminal or web recording (for example tmux or Playwright), assembly, and narration. If a capability has no owner, tell the requester which part and ask how to proceed. When voice-over exists, give each recorder its measured length per beat. Set beat length to `max(voice + 0.35 s, last visible change + 0.35 s)`, with both times measured from beat start. Tell every recorder that a beat it cannot record comes back as `MISSING: <reason>`.
   Done when every beat has an owner and the takes are back.

7. **Review against the plan.** For each beat, find it in the delivered cut, extract a frame from that file at that time (e.g. `ffmpeg -ss 1:12 -i cut.mp4 -frames:v 1 frames/b7.png`; a recording's raw timestamps shift once pauses are cut), look at it, and fill the cut cell with `1:12 frames/b7.png` or `MISSING: <reason>`. A beat also fails when its frame shows text cut off at the edge or ending in `…`, a private name or path, text too small to read, or a still stretch longer than its hold plus the Idle limit.
   With voice-over, check that visual changes land on the words they illustrate. Use `ffmpeg -i cut.mp4 -af silencedetect -f null -`, word proportions to estimate cue times, and extracted frames to inspect alignment.
   Done when `python3 <skill dir>/scripts/coverage.py plan.md` exits 0, or each remaining finding is in the report.

8. **Iterate or report.** Re-record only failed beats and the beats Shared state ties to them, then repeat step 7. Report: the file, its length and size, one line per beat with its timestamp, every `MISSING` beat with its reason, the decisions you need, and coverage.py's last output quoted.
   Done when the report lists every beat.

## Example: one beat row, reviewed

```
| B7 | S7 | full window | press `s` | "Synced to origin" toast, fully visible | 2.5 | Synced to origin | 1:12 frames/b7.png |
```

## References

- [references/numbers.md](references/numbers.md): Length, Hook, Reading time, Frame, Formats, Accessibility; at the end, numbers kept for the editing and narration skills.
- `python3 <skill dir>/scripts/coverage.py --help` lists every check it makes; `bash <skill dir>/scripts/test.sh` tests it.
