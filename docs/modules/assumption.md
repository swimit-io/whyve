# Whyve — assumption

[한국어](./assumption.ko.md)

An unverified project premise with its basis and confirmation/refutation conditions. Sections: `Assumption` (required), `Basis` (empty adds `evidence_missing`), `Confirmation conditions`, `Refutation conditions`; `assumption_status` is derived. It is confirmed or refuted by `retire` with an `evidence` source; recording approval never substitutes for verification.

This is an internal module of Whyve 0.3.0, not a separately installed plugin. Use the [getting-started guide](../../README.md) and the single `$whyve:init` entrypoint. SNAP, OBS and ARCHIVE are built in; other kinds are selected per project.

All writes follow `explicit|auto|adaptive` in the [shared recording policy](../../plugins/whyve/skills/context/references/recording-policy.md): `prepare` with user or policy authorization, `compare` and caller judgments when existing records must be reviewed, then `apply`. Recording automation does not replace the caller's semantic judgment or a user commitment. Disabling a feature preserves data and explicit historical reads.

Records use `context-assumption/v2` under `context-common/v3`; the normative format is [record-model.md](../record-model.md). Consult the [protocol](../../plugins/whyve/skills/assumption/references/assumption-protocol.md) for fields and lifecycle details.
