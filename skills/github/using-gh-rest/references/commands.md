# REST equivalents for gh porcelain

Every row is one `gh api` call. `{owner}` and `{repo}` expand in a git checkout. `<n>` is the issue or PR number. `-F` sends typed values and `@file` contents; `-f` sends strings. Add `--jq '<expr>'` to print one value. Add `--paginate` to a list call that may exceed 30 items.

| Task | Command |
|---|---|
| Read an issue | `gh api repos/{owner}/{repo}/issues/<n> --jq '[.title,.state,.body]\|@tsv'` |
| Read its comments | `gh api --paginate repos/{owner}/{repo}/issues/<n>/comments --jq '.[]\|[.user.login,.body]\|@tsv'` |
| Create an issue | `gh api repos/{owner}/{repo}/issues -f title='<t>' -F body=@"$f" -f 'labels[]=<l>' -F milestone=<number>` |
| Add labels | `gh api repos/{owner}/{repo}/issues/<n>/labels -f 'labels[]=<l1>' -f 'labels[]=<l2>'` |
| Replace all labels | `gh api -X PUT repos/{owner}/{repo}/issues/<n>/labels -f 'labels[]=<l>'` |
| Remove one label | `gh api -X DELETE repos/{owner}/{repo}/issues/<n>/labels/<l>` |
| List milestones (number and title) | `gh api 'repos/{owner}/{repo}/milestones?state=open' --jq '.[]\|[.number,.title]\|@tsv'` |
| Set a milestone | `gh api -X PATCH repos/{owner}/{repo}/issues/<n> -F milestone=<number>` |
| Clear a milestone | `gh api -X PATCH repos/{owner}/{repo}/issues/<n> -F milestone=null` |
| Close as done | `gh api -X PATCH repos/{owner}/{repo}/issues/<n> -f state=closed -f state_reason=completed` |
| Close as not planned | `gh api -X PATCH repos/{owner}/{repo}/issues/<n> -f state=closed -f state_reason=not_planned` |
| Reopen | `gh api -X PATCH repos/{owner}/{repo}/issues/<n> -f state=open` |
| Comment on an issue or PR | `gh api repos/{owner}/{repo}/issues/<n>/comments -F body=@"$f"` |
| Create a PR | `gh api repos/{owner}/{repo}/pulls -f head=<branch> -f base=<base> -f title='<t>' -F body=@"$f"` |
| Edit PR title or body | `gh api -X PATCH repos/{owner}/{repo}/pulls/<n> -f title='<t>' -F body=@"$f"` |
| Retarget a PR (stacked) | `gh api -X PATCH repos/{owner}/{repo}/pulls/<n> -f base=<main>` |
| Read PR base, head SHA, state | `gh api repos/{owner}/{repo}/pulls/<n> --jq '[.base.ref,.head.sha,.state,.merged]\|@tsv'` |
| Read checks of a SHA | `gh api repos/{owner}/{repo}/commits/<sha>/check-runs --jq '.check_runs[]\|[.name,.status,.conclusion]\|@tsv'` |
| Read combined status of a SHA | `gh api repos/{owner}/{repo}/commits/<sha>/status --jq .state` |
| Squash merge with SHA guard | `gh api -X PUT repos/{owner}/{repo}/pulls/<n>/merge -f merge_method=squash -f sha=<head>` |

## Notes

- A milestone is set by its number, not its title. List them first.
- `gh api -X POST` is the default as soon as a `-f` or `-F` field is present; `-X PATCH`, `PUT` and `DELETE` must be named.
- `PUT .../labels` replaces every label; `POST` adds. Use `POST` unless the task says "set exactly these".
- A merge with a stale `sha` answers HTTP 409. A PR with failing required checks or conflicts answers 405.
- `gh pr merge <n> --squash --match-head-commit <sha>` is the porcelain form of the guard. Use the REST call when `gh pr` fails with `projectCards`.
