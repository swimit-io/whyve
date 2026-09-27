---
name: intent
description: When a durable desired project direction emerges, recall and compare it, and record or supersede an INTENT.
---

Runtime: Node.js 20.20.0+. Run the `.mjs` entrypoints of this package; resolve `/loaded/whyve/skills/...` from this file's own path. No Python, global install, `--help` or reading plugin scripts.

# Intent

INTENT (`authority: authoritative`) is a desired project direction that can guide later decisions, one per exact `(scope, key)`. Decline observed facts, unverified premises, chosen commitments and living-document content; route them to their kinds. INTENT and DEC are independent: neither requires the other. Follow the [recording policy](../context/references/recording-policy.md) for settings, approval and statuses. Use the active language for user text and English for machine fields; keep user-authored prose.

- Body: `intent` (required), `success_criteria` (list; empty adds `success_criteria_missing`), `constraints`, `revisit_conditions` (lists).
- Recall relevant direction with `intent_cli.mjs list --scope <scope> --scope-match overlap`, then `read`.
- A capture into an occupied slot returns `needs_review`. A changed direction is a `supersede`: compare, cite both actual Intent bodies, judge the predecessor `replace`, then prepare with the receipt and judgment (same flow as the decision skill). `update` only supplements.
- A DEC may cite an INTENT with a `serves:intent` source; INTENT stores no inverse edge.

A direct, explicit, unconditional user statement that settles the direction, scope and lifecycle effect is approval; ask only about unresolved meaning, never a second storage question.

```bash
cat > /tmp/whyve-intent.json <<'EOF'
{
  "mutation": {
    "action": "capture",
    "record": {
      "kind": "intent",
      "title": "Work fully offline",
      "scope": "pkg",
      "key": "offline-first",
      "body": {
        "intent": "Every feature works without network access.",
        "success_criteria": ["The full test suite passes with networking disabled."],
        "constraints": ["No hosted services."]
      }
    }
  }
}
EOF
node /loaded/whyve/skills/intent/scripts/intent_cli.mjs prepare --input /tmp/whyve-intent.json --approved --apply
```

Details: [intent protocol](references/intent-protocol.md).
