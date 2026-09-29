# Whyve — document

[한국어](./document.ko.md)

A living document describing the current state of one topic, read with `list` and `read`. It has one `Content` section per exact scope and key (slot `exact-scope-key`) and is stored as `title.md`. `update` replaces the content under the same ID and slot; moving scope or key is a supersede. Split large knowledge into stable chapter slots. Keep external deliverables as ordinary files in your repository.

This is an internal module of Whyve 0.3.0, not a separately installed plugin. Use the [getting-started guide](../../README.md) and the single `$whyve:init` entrypoint. SNAP, OBS and ARCHIVE are built in; other kinds are selected per project.

All writes follow the project's recording mode (`explicit`, `auto`, or `adaptive`), as defined in the [shared recording policy](../../plugins/whyve/skills/context/references/recording-policy.md): `prepare` with user or policy authorization, `compare` and caller judgments when existing records must be reviewed, then `apply`. Recording automation does not replace the caller's semantic judgment or a user commitment. Disabling a feature keeps existing records, which remain readable on request.

Records use `context-document/v2` under `context-common/v3`; the normative format is [record-model.md](../record-model.md). Consult the [protocol](../../plugins/whyve/skills/document/references/document-protocol.md) for fields and lifecycle details.
