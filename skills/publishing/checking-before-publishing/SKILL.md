---
name: checking-before-publishing
description: Privacy check for anything about to go public. Use when about to post an issue or PR comment, opening a PR, committing, pushing, publishing a release, blog post or README, or sharing screenshots, GIFs, videos or terminal recordings; when relaying a subagent's text to a public place; or when the user asks to "check for private data", "scrub" or "redact" something before sharing.
---

# Checking Before Publishing

Find and remove private data in text and media before they leave the machine.

**Check the exact bytes that will be published, every line and every frame, after the last edit.**

Private data here means: usernames and home paths, hostnames and `user@host` prompts, emails, tokens and keys, session ids, internal URLs and IPs, employer, customer and private repo names, and local tmp or scratch paths.

Text a subagent or tool wrote is the highest risk: it reaches the public place without a person reading it. Scan it like your own text.

Never dump a process environment (`env`, `printenv`, `/proc/*/environ`) to look for a value: it holds session tokens, which then land in transcripts and outputs.

## 1. Write the final content to files

Put each thing you will publish in a file: a comment or PR body in a `.md` file (post it with `--body-file`), a commit as its staged diff (`git diff --cached`) plus its message, a recording as its `.cast` or text log, and media as PNG frames.

For a GIF or video, extract every frame that differs from the one before: `ffmpeg -i demo.gif -vf mpdecimate -fps_mode vfr frames/%04d.png`. Sampling at a fixed rate can skip a short-lived leak, and leaks often appear only in the last frames, where the demo shows its output.

Done when every item to publish exists as a file, and each video or GIF exists as a frame directory.

## 2. Scan the text

Run the bundled scan on every text file. The script lives in this skill's folder, so use its full path:

```bash
node <this-skill-dir>/scripts/scan.mjs [--deny <word>]... <file|dir|->...
```

It finds home paths, scratch paths, tokens, secret assignments, emails, private IPs, internal hosts, `user@host` prompts and UUID session ids, and decodes `.cast` files to plain text first. Your own names (username, hostnames, employer, customers, private repos) are not generic patterns: pass them with `--deny`, `PUBLISH_DENY=a,b`, or one per line in `PUBLISH_DENY_FILE` (default `~/.config/publish-deny.txt`). Each finding prints `file:line: kind: match -> fix`; exit 1 means findings, exit 2 a usage or read error, `--json` prints an array. Without Node, use `grep -nE '/home/|/Users/|@|token|key|secret'` plus your deny words.

Then read the text once yourself: the scan knows a private project or customer name only if it is in the deny list.

Done when the scan exits 0, or your reply lists each remaining finding as a deliberate public value (for example a noreply email).

## 3. Look at every frame

The scan skips images. Open every extracted frame and every screenshot and read the text in it: prompt, title bar, paths in output, notifications, browser tabs.

Done when your reply names the frame range you viewed (for example `frames 0001-0042 viewed`) and what you found.

## 4. Fix at the source and check again

- Text: edit the file, then rerun step 2.
- Recording: re-record with a neutral environment (`PS1='$ '`, a demo `HOME` and user) or the recorder's replacement filter, render again, and redo steps 1 to 3 on the new output. A symlink to a neutral folder does not hide the real path: many tools print the resolved path.
- Secret: remove it and tell the user to rotate it; it may already sit in git history or a log.

Done when the final files pass steps 2 and 3, and exactly those files are published.
