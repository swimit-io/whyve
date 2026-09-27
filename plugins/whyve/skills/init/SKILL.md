---
name: init
description: Set up or reconfigure the installed Whyve plugin for a project, choosing semantic features and a recording approval mode.
---

Runtime: Node.js 20.20.0+. Run the `.mjs` entrypoints of this package; resolve `/loaded/whyve/skills/...` from this file's own path. No Python, global install or `--help`.

# Whyve init

Init configures already-installed code; it never installs or uninstalls plugins. Select project features (`decision`, `assumption`, `term`, `intent`, `document`) and `explicit|auto|adaptive` recording. Recommend adaptive for everyday use, but never opt a project into automatic recording without the user's choice. Omitted options keep the current settings; a fresh vault defaults to `decision` and `explicit`. SNAP, OBS and ARCHIVE are built in.

```bash
node /loaded/whyve/skills/init/scripts/whyve_init.mjs --host codex
node /loaded/whyve/skills/init/scripts/whyve_init.mjs --host claude-code --features decision,intent,document --approval-mode adaptive
```

To add one feature and keep the rest, use its wrapper, for example `node /loaded/whyve/skills/init/scripts/intent_init.mjs`.

- Settings go to the project's `.whyve/config.json`; `--host` writes the managed guidance block into `AGENTS.md` (codex) or `CLAUDE.md` (claude-code) and keeps everything outside the markers. Use `--project DIR` for another project and `--vault DIR` for an existing shared vault; projects sharing a vault keep separate settings.
- `--features ''` selects built-ins only. Re-running init adds missing areas without deleting data. Disabling a feature stops new writes and automatic participation; its records stay readable.
- Init is not a content migration. A `context-common/v2` vault keeps working for reads; adding areas or writing requires the explicit format migration (`whyve migrate-project PATH --to-format context-common/v3`, see MIGRATION). Do not run it on the user's behalf without their request.
- On an error, report its `code` and message and retry the same init after the cause is fixed; completed steps are idempotent.

Use the active language for setup guidance and explanatory errors ([active language](../context/references/active-language.md)); keep commands, options, codes and filenames in English. See the [recording policy](../context/references/recording-policy.md) for mode semantics.
