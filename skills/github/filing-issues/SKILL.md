---
name: filing-issues
description: "GitHub issue filing workflow. Use when the user asks to 'file an issue', 'open an issue for this', 'write this up as an issue', 'create a ticket for this idea', or wants a bug, idea or follow-up from the current session recorded in a GitHub repo."
---

# Filing issues

Turn one idea, bug or follow-up into one GitHub issue that a stranger can check, build and test.

**Every claim in the issue is checked against the default branch before it is written down.** An invented `file:line` or a guessed field sends the next implementer after code that is not there.

Never close or edit an existing issue while filing. The only change to other issues is one comment with the new number (step 6).

## 1. Check for an existing issue

Run in the repo's checkout. Search open and closed issues with the words a reporter would use:

```bash
gh issue list --state all --search '<keywords>' --limit 20 --json number,title,state
gh issue list --state all --limit 20 --json title   # recent titles, for the title style in step 3
```

Read every hit that looks close. A match that fully covers the idea ends the task: report its number and file nothing. A partial match becomes a "Related issues" entry in the new issue.

Done when the reply can name the issues found (or "none for: <keywords>") and says whether any of them covers the idea.

## 2. Verify every claim

Judge the code at the default branch, not at the working tree or from memory:

```bash
git fetch -q origin
main=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
git grep -n '<symbol>' "origin/$main"
```

- A code claim cites `path:line` taken from that grep output. A claim with no hit is rewritten as an open question or dropped.
- A data claim (a field in a log, a transcript or an API reply) quotes one observed value, copied from the file or reply. A field seen once is "seen in one sample", not "always present".
- A claim about behaviour is checked by running the command or reading the code path, and the issue says which.

Done when every statement in the Data section of the draft has a `path:line` or a quoted value next to it, or sits under "Open questions".

## 3. Write the body to a private file

Name the file for this issue and keep it outside the checkout, for example `$(mktemp -d)/issue-<slug>.md`. A shared name such as `body.md` gets overwritten by a parallel job, and the wrong text then lands in the wrong issue or PR.

Use these sections, in this order. Drop a section only when it has nothing to say:

```markdown
## Idea            (or "Problem" for a bug: what is wrong, for whom)

## Data
- Verified fact with `path:line`, or a quoted observed value.

## Behaviour
What the user or caller sees after the change.

## Acceptance
- [ ] An observable, testable result.
- [ ] Tests cover it.
- [ ] Docs and changelog updated (when the repo keeps them).

## Open questions
- A decision the implementer must not guess.

## Related issues
- Depends on #n
- Should land before #m
- Related: #k
```

Acceptance items are things a reviewer can check by running or reading, not "works well". An issue without acceptance items cannot be closed with confidence.

The title describes the result in the style of the recent titles from step 1. When those use Conventional Commits, use a type prefix (`feat:`, `fix:`, `chore:`, `ci:`, `refactor:` or `docs:`), imperative, lower case, no period.

Done when the private file holds the sections above, and the title is one line in the repo's title style.

## 4. Keep private data out

The repo may be public. Strip tokens, home-directory paths, host names, and customer or employer names and data from the body and title. Generalise a log excerpt instead of pasting it. Run a privacy/secret check of the bundle with a skill or tool if available. Otherwise check the final body and title by hand: read every line for secrets, private paths, hosts and names. Include emails, session IDs, internal URLs and IPs, and private repository names. Replace private values with placeholders and recheck after the last edit.

Done when the body file has no home path, token, private host or customer detail.

## 5. Read the milestones and labels, then create

Read the rules before choosing:

```bash
gh api --paginate 'repos/{owner}/{repo}/milestones?state=open' --jq '.[] | {number, title, description, due_on}'
gh label list --limit 200 --json name,description
```

- Pick the milestone whose description rule fits the issue. When none fits, create the issue without one and say so in the reply. A guessed milestone puts the issue into a release it does not belong in.
- Pick labels only from that list. A label the repo lacks goes into the reply as a suggestion, never into the repo.

Create through the REST API. `gh issue create`, `view` and `edit` can fail with a GraphQL `projectCards` error on repos that still hold Projects (classic) data, and a retry fails the same way:

```bash
gh api repos/{owner}/{repo}/issues -f title='<title>' -F body=@<private-body-file> -F milestone=<number>
gh api repos/{owner}/{repo}/issues/<n>/labels -f 'labels[]=<label>'
```

Omit `-F milestone` when no milestone fits. Take the issue number and `html_url` from the first reply.

The milestone API can lag a few seconds. Re-read before reporting:

```bash
gh api repos/{owner}/{repo}/issues/<n> --jq '{url: .html_url, title: .title, milestone: .milestone.title, labels: [.labels[].name]}'
```

Done when the re-read shows the title, the milestone (or none, on purpose) and the labels you set.

## 6. Cross-link

For each related issue, add one comment with the new number and the relation, with the same REST route:

```bash
gh api repos/{owner}/{repo}/issues/<m>/comments -f body='Filed #<n>: <title>. <Depends on / Blocks / Related>.'
```

The new issue's "Related issues" section states each dependency as `Depends on #n` or `Should land before #m`, so that the order is readable from either side.

Done when each related issue has one comment naming the new number, and the new issue's Related issues section lists the same numbers.

## 7. Report

Reply with the issue URL, the title, the milestone and labels that were set (or why none), the issues commented on, and the open questions left for the user. Do not paste the whole body back.

Done when the reply holds the URL and each item set, and the reply lists every gh api write this run made, and it holds only the create, the labels call and the step-6 comments.
