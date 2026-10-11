#!/usr/bin/env bash
# Creates ./app: a git repo with tag v1 and branch v2 of a small terminal app.
# v2 changes two things: the status line shows failures, and failed rows get a marker.
set -euo pipefail
git init -q app && cd app
write() {
  cat > tasks.sh <<APP
#!/usr/bin/env bash
clear
printf '%s\n' ' Tasks' '' '  build      done' '  test       $1' '  lint       done' '' ''
printf '%s\n' ' $2'
read -rsn1 _
APP
  chmod +x tasks.sh
}
write 'failed' '3 tasks'
printf '# Changelog\n\n## v1\n- First release\n' > CHANGELOG.md
git add . && git -c user.name=t -c user.email=t@example.com commit -qm v1 && git tag v1
write 'failed  ✗' '3 tasks · 1 failed'
printf '# Changelog\n\n## v2\n- The status line counts failed tasks\n- Failed rows are marked with ✗\n\n## v1\n- First release\n' > CHANGELOG.md
git checkout -qb v2 && git add . && git -c user.name=t -c user.email=t@example.com commit -qm v2
