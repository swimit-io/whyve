---
name: observation
description: Record reusable facts, evidence, or lessons as non-binding observations, and update, retire, or discard them.
---

Runtime: Node.js 20.20.0+. Run the `.mjs` entrypoints of this package; resolve `/loaded/whyve/skills/...` from this file's own path. Don't use Python, a global install, or `--help`, and don't read plugin scripts.

# Observation

OBS records a reusable fact, finding or lesson with `authority: evidence`. Never phrase it as a decision future work must follow. Follow the [recording policy](../context/references/recording-policy.md) for settings, approval and statuses. Use the active language for user text and English for machine fields; keep user-authored prose.

A direct, explicit, unconditional user statement that settles the observation, scope and capture effect is approval; ask one question only about unresolved meaning. Acknowledgement, praise, a condition, an edit request or a topic change is not approval. Do not show the rendered file or ask a second storage question.

Fields (`node /loaded/whyve/skills/context/scripts/context_cli.mjs schema observation` prints them):

- `observation` (section Observation): required, the claim itself.
- `evidence` (Evidence): optional list of how it was verified: commands and results, file paths, ARCHIVE `ctx_` IDs. Missing evidence adds the quality flag `evidence_missing`; the record is still stored. Give evidence when you have it, and never invent it.
- `impact`, `current_handling`, `followup_conditions` (list): optional.
- Headers (given in `body`): `verified_at`, set by an `update` when the claim is re-verified (never earlier than `created_at`), and `kind_hint: "decision"` for a decision-like fallback that the user may later confirm as a DEC.
- The whole body (all sections except Sources) is at most 262,144 UTF-8 bytes (256 KiB); larger input returns `needs_archive`. There is no item-count limit; do not truncate evidence in a way that changes its meaning.

```bash
cat > /tmp/whyve-obs.json <<'EOF'
{
  "mutation": {
    "action": "capture",
    "record": {
      "kind": "observation",
      "title": "Index rebuild is required after a Git merge",
      "scope": "pkg/storage",
      "body": {
        "observation": "After a Git merge of two branches that both added records, the area index lists rows from both sides.",
        "evidence": ["git merge feature-a produced a union index", "whyve refresh --fix restored one row per record"],
        "impact": "Unrepaired indexes fail strict listing."
      }
    }
  }
}
EOF
node /loaded/whyve/skills/context/scripts/context_cli.mjs prepare --input /tmp/whyve-obs.json --approved --apply
```

Lifecycle (use the `contentDigest` from `read`):

- `update` only supplements: fill an empty optional section or extend one (for example add evidence, or set `verified_at` with fresh evidence). A changed claim is a `supersede` with a new record; judge the predecessor `replace` after `compare` as in the recording policy.
- `retire` with `reason: "invalidated"` requires a `note` with the substantive disproof. Age alone does not retire evidence.
- `discard` removes an OBS that no other record references.
