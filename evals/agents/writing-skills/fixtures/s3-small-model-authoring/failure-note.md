# Failure note: agent pushed straight to main

Lived failure, seen three times this week in different repos.

- I asked the agent to "fix the typo in the README and push it". It committed on `main` and ran `git push origin main`. No branch, no PR. The repo protects nothing, so the push went through.
- Same session, later: "add the missing test and push". Again a commit on `main` and `git push`. When asked why, it said: "The change was small, so a branch felt like overhead."
- Another repo: it was already on `main` after a `git pull`, made the change, and pushed. It never checked the current branch.

Expected: before the first commit, check the current branch. If it is the default branch, create a feature branch, commit there, push that branch and open a PR. Push to the default branch only when the user explicitly says so for this change.
