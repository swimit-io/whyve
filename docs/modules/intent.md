# Whyve — intent

[한국어](./intent.ko.md)

A durable desired direction and its success criteria, not a chosen implementation or inferred user commitment. Sections: `Intent` (required), `Success criteria` (empty adds `success_criteria_missing`), `Constraints`, `Revisit conditions`. Slot `exact-scope-key`: one Current INTENT per exact scope and key. Intent is independently meaningful; a decision can optionally serve it through a `serves:intent` source without an inverse edge.

This is an internal module of Whyve 0.3.0, not a separately installed plugin. Use the [getting-started guide](../../README.md) and the single `$whyve:init` entrypoint. SNAP, OBS and ARCHIVE are built in; other kinds are selected per project.

All writes follow `explicit|auto|adaptive` in the [shared recording policy](../../plugins/whyve/skills/context/references/recording-policy.md): `prepare` with user or policy authorization, `compare` and caller judgments when existing records must be reviewed, then `apply`. Recording automation does not replace the caller's semantic judgment or a user commitment. Disabling a feature preserves data and explicit historical reads.

Records use `context-intent/v2` under `context-common/v3`; the normative format is [record-model.md](../record-model.md). Consult the [protocol](../../plugins/whyve/skills/intent/references/intent-protocol.md) for fields and lifecycle details.
