# Whyve — decision

[한국어](./decision.ko.md)

An authoritative user choice with a scope and key. Sections: `Decision` (required), `Rationale`, `Rejected alternatives`, `Evidence and constraints`, `Trade-offs`, `Revisit conditions`; empty optional sections become quality flags. Slot `decision-overlap`: one Current DEC per scope and key, and overlapping scopes with the same key coexist only when judged `separate`. The caller compares full bodies, not hashes. Supersede needs a `replace` judgment for the predecessor and keeps it as `doNotFollow` history; a revisit condition permits reassessment, not implementation. Korean headings `결정`, `취지`, `반려대안` remain accepted aliases.

This is an internal module of Whyve 0.3.0, not a separately installed plugin. Use the [getting-started guide](../../README.md) and the single `$whyve:init` entrypoint. SNAP, OBS and ARCHIVE are built in; other kinds are selected per project.

All writes follow the project's recording mode (`explicit`, `auto`, or `adaptive`), as defined in the [shared recording policy](../../plugins/whyve/skills/context/references/recording-policy.md): `prepare` with user or policy authorization, `compare` and caller judgments when existing records must be reviewed, then `apply`. Recording automation does not replace the caller's semantic judgment or a user commitment. Disabling a feature keeps existing records, which remain readable on request.

Records use `context-decision/v2` under `context-common/v3`; the normative format is [record-model.md](../record-model.md). Consult the [protocol](../../plugins/whyve/skills/decision/references/decision-protocol.md) for fields and lifecycle details.
