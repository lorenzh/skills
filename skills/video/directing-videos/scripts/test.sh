#!/usr/bin/env bash
# Self-test for coverage.py; exit 0 when all pass.
cd "$(dirname "$0")" || exit 2
C=./coverage.py F=test-fixtures fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cp -r $F/frames "$tmp/"
t(){ local want=$1 name=$2; shift 2; out=$("$@" 2>&1); got=$?; if [ "$got" = "$want" ]; then echo "ok   $name"; else echo "FAIL $name (exit $got, want $want)"; echo "$out"; fail=1; fi; }
has(){ local name=$1 pat=$2 file=$3; out=$(python3 "$C" "$file"); got=$?; if [ "$got" = 1 ] && grep -qF -- "$pat" <<<"$out"; then echo "ok   $name"; else echo "FAIL $name (exit $got, want 1): expected '$pat' in:"; echo "$out"; fail=1; fi; }
mk(){ sed "$1" $F/good.md > "$tmp/$2.md"; echo "$tmp/$2.md"; }
t 0 "clean plan (padding, S3a, escaped pipe, range budget)" python3 $C $F/good.md
t 2 "misuse" python3 $C
t 2 "missing file" python3 $C "$tmp/nope.md"
t 0 "help" python3 $C --help
t 0 "hour timestamp" python3 $C "$(mk 's#0:02 frames/b1.png#1:02:03 frames/b1.png#' hours)"
has "skip without approval" "scope: S2" "$(mk 's/Approved: user, 2026-10-10//' a)"
has "missing beat blocks" "missing: B1" "$(mk 's#0:02 frames/b1.png#MISSING: too costly#' b)"
has "frame must exist" "frame frames/b9.png not found" "$(mk 's#0:02 frames/b1.png#0:02 frames/b9.png#' c)"
has "empty cut" "B1: no cut entry" "$(mk 's#0:02 frames/b1.png#-#' d)"
has "over budget upper bound" "budget:" "$(mk 's/| 3 s |/| 30 |/' e)"
has "unfilled slot" "slot: unfilled <item>" "$(mk 's/- S1: list/- S1: <item>/' f)"
has "lettered id uncovered" "scope: S3a" "$(mk 's/| S3a |/| S3 |/' g)"
has "padded heading still parsed" "missing: B1" "$(mk 's/^## Beats/##   Beats/; s#0:02 frames/b1.png#MISSING: x#' h)"
has "unescaped pipe breaks row" "B2: 9 cells" "$(mk 's/dark\\|light/dark|light/' i)"
has "bad hold" "B1: hold 'nan'" "$(mk 's/| 3 s |/| nan |/' j)"
has "no budget" "no '- Budget:" "$(mk '/Budget/d' k)"
has "missing section" "no '## Stage'" "$(mk 's/^## Stage/## Setup/' l)"
printf '# Video plan: x\n' > "$tmp/m.md"; has "title only" "no '## Beats'" "$tmp/m.md"
has "scope line without id" "scope line 'S4ab: x'" "$(mk 's/^- S1: list/- S1: list\n- S4ab: x/' n)"
has "partial id not counted" "scope: S3a" "$(mk 's/| S3a |/| S3ab |/' o)"
has "negative budget" "positive number" "$(mk 's/Budget: 15 to 20 s/Budget: -20 s/' p)"
has "hyphen range upper bound" "budget 35 s" "$(mk 's/Budget: 15 to 20 s/Budget: 25-35 s/; s/| 3 s |/| 40 |/' r)"
t 0 "hyphen range is not negative" python3 $C "$(mk 's/Budget: 15 to 20 s/Budget: 15-20 s/' s)"
has "empty stage field" "Stage 'Reset' is empty" "$(mk 's#- Reset: ./reset.sh#- Reset:#' q)"
cp ../templates/plan.md "$tmp/tpl.md"; t 1 "raw template fails" python3 $C "$tmp/tpl.md"
exit $fail
