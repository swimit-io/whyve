# Two-session demo

`two-sessions.gif` / `two-sessions.mp4` (18 s, 1280×960) show the README example
"Try one decision across two sessions" with a real agent host.

## What actually ran

`record-sessions.sh` created a fresh Git project, ran `whyve init` (Decision,
`explicit`) and sent the three README messages to Claude Code with this checkout's
plugin loaded through `--plugin-dir`:

1. `claude -p "I decided this trial will support CSV only …"` records a decision.
2. `claude -p "Why did we postpone Excel support?"` is a new session. It has no
   conversation history; the answer comes from the stored record.
3. `claude -p --continue "What about including Excel in this trial too? …"`
   continues session 2 and compares the idea with the stored decision without
   replacing it.

Between 1 and 2 the script runs `ls context/decision` to show the Markdown record.
`transcript.txt` holds the unedited answers, session IDs, model IDs, durations,
the Claude Code version and the Whyve version of that run.

The real invocation also passed `--setting-sources project,local`,
`--strict-mcp-config` (so the user's own hooks, plugins and MCP connectors stay
out) and `--dangerously-skip-permissions` (the project is a throwaway temp
directory). The terminal shows the shorter `claude -p` form.

## What the recording adds

`two-sessions.tape` does not call the model. It plays `transcript.txt` back with
`replay.mjs`: the words are unchanged, lines are wrapped at word boundaries,
Markdown `**bold**` and `` `code` `` are shown as terminal styles, and waiting time
is cut so the whole flow fits in under 20 seconds.

## Regenerate

```bash
assets/demo/record-sessions.sh     # logged-in `claude` CLI; overwrites transcript.txt
vhs assets/demo/two-sessions.tape  # brew install vhs
```

Model answers vary between runs, so a new recording will not match word for word.
Check the new transcript before committing it. These files are not part of the
npm package.
