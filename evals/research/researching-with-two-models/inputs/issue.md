# Issue 12: the status line is slow
The status bar refresh calls `git status` every 2 s. Users report lag in big repos. Should we cache it or use a file watcher? Must keep: no new runtime deps, works on Linux and macOS.
