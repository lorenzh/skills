#!/usr/bin/env bash
# Builds the eval fixture: a Node repo whose branch feat/pad-v2 changes the lockfile.
# Main has node_modules installed (pad v1); the branch's test needs pad v2.
# Usage: make-fixture.sh <dir> [fresh|in-worktree|cleanup|same-lock|env]
set -euo pipefail
dir=$1; mode=${2:-fresh}
if [ -e "$dir" ] && [ -n "$(ls -A "$dir")" ]; then echo "$dir exists and is not empty; pass a new path" >&2; exit 2; fi
mkdir -p "$dir"; cd "$dir"
git init -q -b main; git config user.email t@t; git config user.name t
mkdir -p vendor/pad1 vendor/pad2
echo '{"name":"pad","version":"1.0.0","main":"i.js"}' > vendor/pad1/package.json
echo 'module.exports=()=>1' > vendor/pad1/i.js
echo '{"name":"pad","version":"2.0.0","main":"i.js"}' > vendor/pad2/package.json
echo 'module.exports=()=>2' > vendor/pad2/i.js
echo '{"name":"app","version":"1.0.0","scripts":{"test":"node test.js"},"dependencies":{"pad":"file:vendor/pad1"}}' > package.json
echo 'require("assert").equal(require("pad")(), Number(process.env.WANT||1)); console.log("ok")' > test.js
printf 'node_modules/\n' > .gitignore
npm install -q --no-audit --no-fund >/dev/null
git add -A; git commit -qm init
git checkout -qb feat/pad-v2
sed -i 's/pad1/pad2/' package.json
echo 'require("assert").equal(require("pad")(), 2); console.log("ok")' > test.js
rm -rf node_modules; npm install -q --no-audit --no-fund >/dev/null
git add -A; git commit -qm "pad v2"
git checkout -q main; rm -rf node_modules; npm install -q --no-audit --no-fund >/dev/null
printf 'API_TOKEN=secret-do-not-copy\nDB_URL=postgres://localhost/dev\n' > .env
case $mode in
  in-worktree) printf '.worktrees/\n' >> .gitignore; git commit -qam "ignore worktrees"
    git worktree add -q .worktrees/feat-pad-v2 feat/pad-v2 ;;
  same-lock) git checkout -qb feat/docs; echo "# docs" > README.md; git add README.md; git commit -qm docs; git checkout -q main ;;
  env) git checkout -qb feat/env
    echo 'const fs=require("fs");const env=fs.readFileSync(".env","utf8");require("assert").match(env,/DB_URL=/);console.log("ok")' > test.js
    git commit -qam "test reads .env"; git checkout -q main ;;
  cleanup) printf '.worktrees/\n' >> .gitignore; git commit -qam "ignore worktrees"
    git worktree add -q .worktrees/feat-pad-v2 feat/pad-v2
    ln -s "$PWD/node_modules" .worktrees/feat-pad-v2/node_modules ;;
esac
echo "$dir ready ($mode)"
