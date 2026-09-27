# Whyve — term

[한국어](./term.ko.md)

A project-specific term and its `Definition`, with optional aliases, deprecated terms and a `project_signal`. The key is derived from the term; the file is `title.md`. Slot `term-overlap`: canonical keys of term, aliases and deprecated terms must not intersect across Current terms in overlapping scopes. Generic dictionary meanings are not recorded.

This is an internal module of Whyve 0.3.0, not a separately installed plugin. Use the [getting-started guide](../../README.md) and the single `$whyve:init` entrypoint. SNAP, OBS and ARCHIVE are built in; other kinds are selected per project.

All writes follow `explicit|auto|adaptive` in the [shared recording policy](../../plugins/whyve/skills/context/references/recording-policy.md): `prepare` with user or policy authorization, `compare` and caller judgments when existing records must be reviewed, then `apply`. Recording automation does not replace the caller's semantic judgment or a user commitment. Disabling a feature preserves data and explicit historical reads.

Records use `context-term/v2` under `context-common/v3`; the normative format is [record-model.md](../record-model.md). Consult the [protocol](../../plugins/whyve/skills/term/references/term-protocol.md) for fields and lifecycle details.
