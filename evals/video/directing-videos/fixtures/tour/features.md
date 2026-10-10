# jotter 2.0 - features (from the README)

jotter is a terminal note app (TUI). Run `jotter`.

1. Note list with folders, arrow keys move focus
2. `n` new note, opens the editor pane
3. `/` full-text search with live filtering
4. `t` tags: add and filter by tag
5. `p` pin a note to the top
6. `d` delete a note (asks for confirmation, `u` undoes)
7. `s` sync to a git remote (needs a configured remote)
8. `e` export the note to Markdown or PDF (PDF needs pandoc)
9. `?` help overlay with all keys
10. `:theme dark|light` switch theme
11. Encrypted notes: `:lock` asks for a passphrase
12. Option `JOTTER_HOME` changes where notes live; option `autosave=30s` in ~/.config/jotter/config
