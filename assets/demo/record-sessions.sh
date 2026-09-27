#!/usr/bin/env bash
# Records the README "Try one decision across two sessions" example with a real
# Claude Code host and this checkout's Whyve plugin, then writes transcript.txt.
#
#   assets/demo/record-sessions.sh            # needs a logged-in `claude` CLI
#   vhs assets/demo/two-sessions.tape         # renders the GIF/MP4 from transcript.txt
#
# User-level Claude settings (hooks, other plugins) are not loaded; the plugin is
# loaded for these sessions only with --plugin-dir; MCP servers are off
# (--strict-mcp-config). Nothing is installed.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
WORK="$(mktemp -d)/trial-importer"
OUT="$HERE/transcript.txt"

mkdir -p "$WORK"
cd "$WORK"
git init -q
printf '# trial-importer\n\nImports customer lists for the pilot.\n' > README.md
git add README.md
git -c user.name=demo -c user.email=demo@example.invalid commit -qm "initial"
node "$REPO/plugins/whyve/skills/init/scripts/whyve_init.mjs" --host claude-code --json > /dev/null

CLAUDE=(claude -p --setting-sources project,local
  --plugin-dir "$REPO/plugins/whyve"
  --strict-mcp-config --dangerously-skip-permissions --output-format json)

P1="I decided this trial will support CSV only and leave Excel for later. I want to validate the first-use flow quickly. Remember this decision."
P2="Why did we postpone Excel support?"
P3="What about including Excel in this trial too? I haven't decided to change the decision yet."

field() { node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));const v=process.argv[1].split(".").reduce((o,k)=>o?.[k],d);console.log(typeof v==="object"?Object.keys(v).join(","):v)' "$1"; }

run() { # $1 label, $2 display command, $3 prompt, rest: extra flags
  local label="$1" shown="$2" prompt="$3"; shift 3
  local json; json="$("${CLAUDE[@]}" "$@" "$prompt")"
  {
    printf '=== %s | session %s | model %s | %s ms\n' "$label" \
      "$(field session_id <<<"$json")" "$(field modelUsage <<<"$json")" "$(field duration_ms <<<"$json")"
    printf '$ %s "%s"\n' "$shown" "$prompt"
    field result <<<"$json"
  } >> "$OUT"
}

{
  printf '# Whyve two-session demo transcript (real output, not edited)\n'
  printf '# recorded %s | %s | whyve %s | node %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$(claude --version)" "$(node -p "require('$REPO/package.json').version")" "$(node -v)"
  printf '# project: fresh git repo + `whyve init` (Decision, explicit)\n'
} > "$OUT"

run "scene 1" "claude -p" "$P1"
{
  printf '=== scene 1b | shell\n$ ls context/decision\n'
  ls context/decision
} >> "$OUT"
run "scene 2" "claude -p" "$P2"
run "scene 3" "claude -p --continue" "$P3" --continue

echo "wrote $OUT (work dir: $WORK)"
