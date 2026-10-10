#!/usr/bin/env python3
"""Check a filled plan.md (templates/plan.md) for coverage.

usage: coverage.py <plan.md> [--json]

Findings, each with its fix:
  structure  a required section (Brief, Scope, Stage, Beats) or the Budget line is missing,
             Scope or Beats is empty, or a beat row has the wrong number of cells
  slot       a <slot> is still unfilled, or a hold is not a positive number of seconds
  scope      a scope id is in no beat and not under "Out of scope" with "Approved:"
  cut        a beat's cut cell is empty or not `m:ss <frame file>` / `h:mm:ss <frame file>`,
             or the frame file is missing
  missing    a beat is MISSING (blocking: the plan promised it)
  budget     the holds alone add up to more than the budget's upper bound + 10 %
             (action time is not counted: the budget check is a floor, not proof of runtime)
Ids: S1, S4a, B12, B3b. Cells may contain escaped pipes (\\|). Frame paths are relative to the plan's folder.
exit 0 clean, 1 findings, 2 misuse.
"""
import json, math, os, re, sys

SID = r"S\d+[a-z]?"
COLS = 8

def sections(body):
    out = {}
    for m in re.finditer(r"^##\s+(.+?)\s*$(.*?)(?=^##\s|\Z)", body, re.S | re.M):
        out[m.group(1).strip().lower()] = m.group(2)
    return out

def check(path):
    text = open(path, encoding="utf-8").read()
    base = os.path.dirname(os.path.abspath(path))
    body = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    out = [("slot", f"unfilled {m.group(0)}: fill it") for m in re.finditer(r"<[a-z][^<>\n]*>", body)]
    sec = sections(body)
    for name in ("brief", "scope", "stage", "beats"):
        if name not in sec:
            out.append(("structure", f"no '## {name.title()}' section: copy templates/plan.md"))
    scope = re.findall(rf"^\s*[-*]\s+({SID})\s*:", sec.get("scope", ""), re.M)
    approved = set(re.findall(rf"^\s*[-*]\s+({SID})\s*:.*Approved:\s*\S", sec.get("out of scope", ""), re.M))
    for line in re.findall(r"^\s*[-*+]\s+(.*)$", sec.get("scope", ""), re.M):
        if not re.match(rf"({SID})\s*:", line):
            out.append(("structure", f"scope line '{line[:40]}' has no id like S1 or S4a: write '- S<n>: <item>'"))
    for name in ("brief", "stage"):
        for key in re.findall(r"^\s*[-*+]\s+([^:\n]+):\s*$", sec.get(name, ""), re.M):
            out.append(("slot", f"{name.title()} '{key.strip()}' is empty: fill it"))
    if "scope" in sec and not scope:
        out.append(("structure", "Scope lists no '- S1: <item>' lines"))
    covered, holds, beats = set(), 0.0, 0
    for row in sec.get("beats", "").splitlines():
        cells = [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", row.strip().strip("|"))]
        if not re.fullmatch(r"B\d+[a-z]?", cells[0]):
            continue
        beats += 1
        bid = cells[0]
        if len(cells) != COLS:
            out.append(("structure", f"{bid}: {len(cells)} cells, want {COLS}; escape pipes in cells as \\|"))
            continue
        covers, hold, cut = cells[1], cells[5], cells[7]
        covered |= set(re.findall(rf"\b{SID}\b", covers))
        try:
            h = float(hold.rstrip("s ").strip())
            if not math.isfinite(h) or h <= 0:
                raise ValueError
            holds += h
        except ValueError:
            out.append(("slot", f"{bid}: hold '{hold}' is not a positive number of seconds"))
        if cut in ("", "-"):
            out.append(("cut", f"{bid}: no cut entry; write 'm:ss <frame file>', 'h:mm:ss <frame file>' or 'MISSING: <reason>'"))
        elif cut.upper().startswith("MISSING"):
            out.append(("missing", f"{bid} ({covers}): {cut}; re-record it, or get the requester's yes and move its scope id to Out of scope"))
        else:
            m = re.fullmatch(r"(\d+:\d\d(?::\d\d)?)\s+(\S+)", cut)
            if not m:
                out.append(("cut", f"{bid}: '{cut}' is not 'm:ss <frame file>' or 'h:mm:ss <frame file>'"))
            elif not os.path.isfile(os.path.join(base, m.group(2))):
                out.append(("cut", f"{bid}: frame {m.group(2)} not found; extract it from the delivered cut at {m.group(1)}"))
    if "beats" in sec and not beats:
        out.append(("structure", "Beats has no row starting with B1"))
    for s in scope:
        if s not in covered and s not in approved:
            out.append(("scope", f"{s} is in no beat: add a beat, or move it to Out of scope with 'Approved:'"))
    b = re.search(r"^\s*[-*]\s+Budget:(.*)$", sec.get("brief", ""), re.M)
    nums = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", b.group(1))] if b else []
    if not nums or min(nums) <= 0:
        out.append(("structure", "Brief has no '- Budget: <seconds>' line with a positive number"))
    elif holds > max(nums) * 1.1:
        out.append(("budget", f"holds alone add up to {holds:g} s, budget {max(nums):g} s: cut beats or raise the budget with the requester"))
    return out

def main(argv):
    args = [a for a in argv if a != "--json"]
    if args[:1] in (["-h"], ["--help"]):
        print(__doc__.strip()); return 0
    if len(args) != 1:
        print(__doc__.strip(), file=sys.stderr); return 2
    if not os.path.isfile(args[0]):
        print(f"no such file: {args[0]}", file=sys.stderr); return 2
    out = check(args[0])
    if "--json" in argv:
        print(json.dumps([{"kind": k, "msg": m} for k, m in out]))
    else:
        for k, m in out:
            print(f"{k}: {m}")
    return 1 if out else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
