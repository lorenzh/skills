## Research summary (from subagent)

I traced the crash to the config loader. When `~/.config/tool/settings.json` is missing,
`loadConfig()` returns `undefined` and the caller dereferences it.

Evidence: the session transcript at /home/jdoe/.claude/projects/-home-jdoe-work-acme-billing/7f3c9a2e-41d2-4b8e-9f10-2c6d8e1a0b55.jsonl
shows the stack trace at line 412. The same failure reproduces in a scratch copy under
/tmp/claude-1000/scratch/repro.

Suggested fix: default to `{}` when the file is missing.
