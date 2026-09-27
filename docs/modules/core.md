# Whyve — core

[한국어](./core.ko.md)

Storage, indexes, filters and pages, structural comparison, lifecycle validation, locking and the sole physical writer. Built-in SNAP resumes unfinished work (content is replaced by `update`), OBS preserves reusable evidence (evidence is optional; missing evidence is the `evidence_missing` flag), and ARCHIVE preserves immutable source material with a `content_digest`. Discovery is exact `list` filtering plus `searchHeaders`; there is no lexical ranking. DEC authority is never inferred from an observation or snapshot.

This is an internal module of Whyve 0.3.0, not a separately installed plugin. Use the [getting-started guide](../../README.md) and the single `$whyve:init` entrypoint. SNAP, OBS and ARCHIVE are built in; other kinds are selected per project.

All writes follow `explicit|auto|adaptive` in the [shared recording policy](../../plugins/whyve/skills/context/references/recording-policy.md): `prepare` with user or policy authorization, `compare` and caller judgments when existing records must be reviewed, then `apply`. Recording automation does not replace the caller's semantic judgment or a user commitment. Disabling a feature preserves data and explicit historical reads.

Records use `context-snapshot/v2`, `context-observation/v2` and `context-archive/v2` under `context-common/v3`; the normative format is [record-model.md](../record-model.md). Consult the [protocol](../../plugins/whyve/skills/context/references/context-protocol.md) for fields and lifecycle details.
