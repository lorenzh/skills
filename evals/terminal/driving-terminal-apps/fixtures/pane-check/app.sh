#!/usr/bin/env bash
# Fake host TUI. The transcript quotes "Running 2" and draws an untitled box with it;
# the app's own pane (titled Tasks) appears a second later and shows "Running 1".
# The pane's bottom-left corner follows a wide emoji, so it lines up with the top
# corner only when columns are counted in terminal cells.
clear
printf '%s\n' '> does the tasks pane say "Running 2" now?' \
  '  It should read Running 2 once both jobs start, like this:' \
  '  ╭────────────────╮' \
  '  │ Running 2      │' \
  '  ╰────────────────╯' ''
sleep 1
printf '%s\n' '  ╭─ Tasks ─────────────╮' \
  '  │ Running 1           │' \
  '  │ Done 4              │' \
  '✅╰─────────────────────╯'
sleep 600
