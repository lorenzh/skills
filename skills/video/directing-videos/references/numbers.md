# Numbers for directing videos

Labels: [S] standard, study or canonical text; [P] practitioner consensus; [F] folk wisdom, single or vendor source. Defaults marked *tunable* are this skill's choice, not a source's.

Contents: Length · Hook · Reading time · Frame · Formats · Accessibility · For editing-videos · For narrating-videos · Sources

## Length

| Format | Norm | Label |
|---|---|---|
| Business or product video | engagement flat to ~2 min, falls from ~70 % to ~50 % between 6 and 7 min (Wistia, 565k videos) | S |
| Tutorial, instructional | chunks under 6 min; engagement drops sharply after ~6 min (Guo, Kim, Rubin 2014, 6.9M sessions). Split longer material into a series, not one video with chapters | S |
| Launch | teaser 30-45 s, main 60-90 s | F/P |
| README or terminal GIF loop | 10-30 s | F |
| Feature tour | budget = beat holds + action time; past ~6 min split into parts by topic. coverage.py checks only that the holds alone stay within the budget's upper bound + 10 % | tunable |

## Hook

- The product or the result is on screen within 10 s; a logo intro is not the product. [F]
- A view counts after 3 s on Facebook. [S] Early loss: 4.9 % for 1-2 min videos, 17.3 % for 5-10 min (Wistia). [S]

## Reading time

- Hold on-screen text: max(2 s, 0.6 s x words) + 0.5 s. *tunable* (from "read it twice at 200 wpm" [P])
- Code, terminal output and tables need longer than prose: count each visible line as 5 words. *tunable*
- Captions: at most 17-20 characters per second, 42 characters per line, 2 lines (Netflix style guide, secondary) [S-ish]; BBC ~15 cps [P].
- Any text cut off at the frame edge or with an ellipsis is a defect: widen the frame or shorten the text.
- Typing in terminal demos: 50-100 ms per character; type long commands off camera or paste them. [P]
- Idle limit: a still stretch may run at most 2 s past its planned hold; loops hold the last frame ~3 s. [P, tunable]

## Frame

- Fixed capture size, fonts large enough for a phone (terminal at most ~100 columns at 1080p). [P]
- Wide shot before detail; same layout across cuts. [P]
- Neutral stage: demo data, neutral user name, host name, home path and prompt; no notifications, tokens or customer names. Scan every frame text for them before delivery. [P]
- Hanselman survey (2008, ~1,000 devs): 82 % want minimal clutter, 74 % find zoom on key areas useful, 58 % want visible clicks. [S, dated]

## Formats

| Destination | Use | Label |
|---|---|---|
| Web page, docs | MP4 (H.264, even dimensions, faststart) or WebM; a 3.7 MB GIF became 551 KB MP4 / 341 KB WebM | S |
| GitHub README, issue, PR | MP4 up to 10 MB (free plan; 100 MB paid); GIF up to 10 MB where video will not play | S |
| YouTube | chapters: first at 00:00, at least 3, ascending; thumbnail 1280x720, under 2 MB | S |
| X, social feeds | MP4 H.264 + AAC; autoplays muted, so captions are burned in or uploaded | P |

## Accessibility (WCAG 2.x)

- 1.2.2 Captions for prerecorded audio (A). A narrated video without captions fails.
- 1.2.5 Audio description (AA), unless the narration already says what the picture shows.
- 2.3.1 At most 3 flashes per second (A).
- 2.2.2 Autoplaying motion over 5 s beside other content needs a pause control (A): applies to looping GIFs in a README.

## For editing-videos

Not used by directing-videos; kept for the sibling editing skill until it owns them.
- Murch's rule of six, in priority order: emotion 51, story 23, rhythm 10, eye-trace 7, 2D plane 5, 3D space 4; never trade a higher one for a lower one. [S]
- Cut on action; J-cut and L-cut to carry narration across picture changes; jump cuts are fine to trim typing and waiting. [P]
- Trim dead air; pauses only for reading time or to let a result land. [P]
- agg / asciinema idle limit default 5 s, agg last frame 3 s. [S, tool docs]

## For narrating-videos

Not used by directing-videos; kept for the sibling narration skill until it owns them.
- Narration ~150 wpm, ~130 for dense technical content, ~170 ceiling; a 60 s video holds ~140-150 words. [P]
- Write the audio column first, then fit the picture to it. [P]
- Loudness: -14 LUFS streaming, -16 LUFS dialogue, true peak at most -1 dBTP (convention; YouTube publishes none). [P]
- Narration plus identical on-screen text adds load: use short labels, not transcripts (Mayer redundancy). [S]
- Cache TTS audio per script version.

## Sources

Wistia length and retention: https://wistia.com/library/understanding-audience-retention · Guo, Kim, Rubin 2014: https://up.csail.mit.edu/other-pubs/las2014-pguo-engagement.pdf · Reading time: https://www.ssw.com.au/rules/post-production-do-you-give-enough-time-to-read-texts-in-your-videos · Hanselman survey: https://www.hanselman.com/blog/your-opinion-matters-screencast-techniques-survey-results · web.dev GIF to video: https://web.dev/articles/replace-gifs-with-videos · GitHub attachments: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files · YouTube chapters: https://support.google.com/youtube/answer/9884579 · thumbnails: https://support.google.com/youtube/answer/72431 · WCAG quick ref: https://www.w3.org/WAI/WCAG21/quickref/ · Murch summary: https://www.studiobinder.com/blog/walter-murch-rule-of-six/ · Mamet: https://www.markbernstein.org/Books13/OnDirectingFilm.html · Mayer: https://sites.uw.edu/somlearningtech/principles-for-teaching-with-multimedia · Loudness: https://josephnilo.com/blog/dialogue-loudness-lufs-true-peak-video/
