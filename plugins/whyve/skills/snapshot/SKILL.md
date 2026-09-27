---
name: snapshot
description: Save, update, load, or discard a SNAP handoff for unfinished work when requested or permitted by project recording policy; load it when a session resumes earlier work.
---

Runtime: Node.js 20.20.0+. Run the `.mjs` entrypoints of this package; resolve `/loaded/whyve/skills/...` from this file's own path. No Python, global install, `--help` or reading plugin scripts.

# Snapshot

SNAP is mutable resume context (`authority: staging`), not a decision or evidence history. Follow the [recording policy](../context/references/recording-policy.md) for settings, approval and statuses. Use the active language for user text and English for machine fields; keep user-authored prose.

1. Resume: when the user asks to continue earlier work without restating it, list recent SNAPs, read the matching one, and continue from its Next steps and Open items under its constraints. Do not ask the user to restate what the SNAP says.

   ```bash
   node /loaded/whyve/skills/context/scripts/context_cli.mjs snapshot list --order recent --limit 10
   node /loaded/whyve/skills/context/scripts/context_cli.mjs read '<snapshot-id>'
   ```

2. Save only when work is unfinished and the user asked for a handoff (or the `auto`/`adaptive` policy stands in for that request). A direct handoff request that settles content and scope is approval; ask only about unresolved meaning, never a second storage question, and do not show the rendered file. Fill `current_context` (full Markdown is fine), `open_items` and `next_steps`; optional `decided`, `references`, `capture_candidates`. State the exact next step and every constraint the user gave.

   ```bash
   cat > /tmp/whyve-snap.json <<'EOF'
   {
     "mutation": {
       "action": "capture",
       "record": {
         "kind": "snapshot",
         "title": "Release 3.0 docs handoff",
         "scope": "pkg/docs",
         "body": {
           "current_context": "Skills are rewritten; README and MIGRATION remain.",
           "open_items": ["README what's new", "MIGRATION steps"],
           "next_steps": ["Update README.md, then run npm test"]
         }
       }
     }
   }
   EOF
   node /loaded/whyve/skills/context/scripts/context_cli.mjs prepare --input /tmp/whyve-snap.json --approved --apply
   ```

3. Update replaces content. With `replaceBody: true`, omitted optional sections are removed; without it, only the given sections change. Use the `contentDigest` from `read`:

   ```bash
   cat > /tmp/whyve-snap-update.json <<'EOF'
   {
     "mutation": {
       "action": "update",
       "id": "<snapshot-id>",
       "expectedDigest": "<snapshot-contentDigest>",
       "patch": {
         "replaceBody": true,
         "body": {
           "current_context": "README is updated; MIGRATION remains.",
           "open_items": ["MIGRATION steps"],
           "next_steps": ["Write the MIGRATION section"]
         }
       }
     }
   }
   EOF
   node /loaded/whyve/skills/context/scripts/context_cli.mjs prepare --input /tmp/whyve-snap-update.json --approved --apply
   ```

4. Discard one finished SNAP with `{"mutation":{"action":"discard","id":"<snapshot-id>","expectedDigest":"<snapshot-contentDigest>"}}`. SNAP has no history; a SNAP referenced by another record cannot be discarded.

The body limit is 256 KiB (262,144 UTF-8 bytes); larger input returns `needs_archive` and changes nothing. Do not shorten or split the content silently. Text that would break the Markdown structure (for example a line starting with `## `) is framed automatically and read back unchanged. The receipt confirms the write; do not re-read.
