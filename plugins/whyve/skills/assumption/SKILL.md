---
name: assumption
description: When an unverified project premise could affect later decisions, recall and compare it, then record it and later confirm, refute, or replace it.
---

Runtime: Node.js 20.20.0+. Run the `.mjs` entrypoints of this package; resolve `/loaded/whyve/skills/...` from this file's own path. Don't use Python, a global install, or `--help`, and don't read plugin scripts.

# Assumption

ASM (`authority: provisional`) is an explicitly unverified premise within a project scope. Not an observed fact (→ observation), not a committed choice (→ decision), not a bare question, idea or hope. Follow the [recording policy](../context/references/recording-policy.md) for settings, approval and statuses. Use the active language for user text and English for machine fields; keep user-authored prose.

A direct, explicit, unconditional user statement that settles the assumption, scope and lifecycle effect is approval; ask one question only about unresolved meaning, never a second storage question.

- Body: `assumption` (required), `basis` (list; empty adds `evidence_missing`), `confirm_conditions`, `refute_conditions` (lists). No key or slot; many ASMs coexist.
- Recall only when a new, confirmed, refuted or changed premise can affect the current answer: `assumption_cli.mjs list --scope <scope> --scope-match overlap`, then `read` selected rows.
- Confirm or refute with `retire` (`reason: "confirmed"` or `"refuted"`) and at least one `evidence` source; for a refutation also cite affected decisions with `impacts:decision` sources. The status header becomes `confirmed`/`refuted` in history. A DEC is never changed automatically.
- A changed premise is a `supersede` (compare, judge the predecessor `replace`). `update` only supplements.

```bash
cat > /tmp/whyve-asm.json <<'EOF'
{
  "mutation": {
    "action": "capture",
    "record": {
      "kind": "assumption",
      "title": "Most users run Node 20 or newer",
      "scope": "pkg/runtime",
      "body": {
        "assumption": "Most users run Node.js 20 or newer.",
        "basis": ["Recent issues all report Node 20 or 22."],
        "confirm_conditions": ["Download statistics show at least 90% on Node 20+."],
        "refute_conditions": ["Several users report Node 18 only environments."]
      }
    }
  }
}
EOF
node /loaded/whyve/skills/assumption/scripts/assumption_cli.mjs prepare --input /tmp/whyve-asm.json --approved --apply

cat > /tmp/whyve-asm-confirm.json <<'EOF'
{
  "mutation": {
    "action": "retire",
    "id": "<assumption-id>",
    "expectedDigest": "<assumption-contentDigest>",
    "reason": "confirmed",
    "sources": [{ "relation": "evidence", "ref": "npm download statistics 2026-09" }]
  }
}
EOF
node /loaded/whyve/skills/assumption/scripts/assumption_cli.mjs prepare --input /tmp/whyve-asm-confirm.json --approved --apply
```

Details: [assumption protocol](references/assumption-protocol.md).
