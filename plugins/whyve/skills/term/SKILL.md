---
name: term
description: When a project-specific term can change interpretation, recall it, compare it, and record, supersede or deprecate a TERM.
---

Runtime: Node.js 20.20.0+. Run the `.mjs` entrypoints of this package; resolve `/loaded/whyve/skills/...` from this file's own path. No Python, global install, `--help` or reading plugin scripts.

# Term

TERM (`authority: definitional`) defines a word with a project-specific or project-special meaning. Decline generic dictionary meanings, observed facts, committed choices and unverified premises. Follow the [recording policy](../context/references/recording-policy.md) for settings, approval and statuses. Use the active language for user text and English for machine fields; keep user-authored prose.

- Body: `term` and `definition` (required), `aliases`, `deprecated_terms` (lists, at most 12), `project_signal` (`project-specific` or `project-special-meaning`; missing adds `project_signal_missing`). The key is derived from `term`; the file is `title.md`.
- Slot `term-overlap`: in overlapping scopes, the canonical forms of term, aliases and deprecated terms of Current TERMs must not intersect (nor within one record). A clash returns `needs_review`; judge it from the actual Definition bodies.
- Look up a term only when one actually encountered is ambiguous or project-specific, never for every word: `term_cli.mjs list --scope <scope> --scope-match overlap --text '<term>'`, then `read`.
- A changed definition is a `supersede` (compare, judge the predecessor `replace` from both actual term and Definition bodies). `retire` with `reason: "deprecated"` needs a `note`, for example naming the replacement term. `update` only supplements.

A direct, explicit, unconditional user statement that settles the term, definition, scope and lifecycle effect is approval; ask only about unresolved meaning, never a second storage question.

```bash
cat > /tmp/whyve-term.json <<'EOF'
{
  "mutation": {
    "action": "capture",
    "record": {
      "kind": "term",
      "title": "Vault",
      "scope": "pkg",
      "body": {
        "term": "Vault",
        "definition": "The directory that holds context/ and its records.",
        "aliases": ["context root"],
        "project_signal": "project-specific"
      }
    }
  }
}
EOF
node /loaded/whyve/skills/term/scripts/term_cli.mjs prepare --input /tmp/whyve-term.json --approved --apply
```

Details: [term protocol](references/term-protocol.md).
