# Compatibility contract (Whyve 0.3.0, `context-common/v3`)

Identifiers: package `@whyve/context` 0.3.x, protocol `context-common/v3`, record
schemas `context-<kind>/v2`, area index `context-area-index/v2`, root index
`context-root-index/v2`. Package and schema versions are independent. The
normative record convention is [record-model.md](record-model.md).

## Preserved guarantees

- The eight kinds remain SNAP, OBS, ARCHIVE, DEC, ASM, TERM, INTENT and
  DOCUMENT, with Current/History states, reciprocal successor links, typed
  relations, scoped slots and the `explicit|auto|adaptive` project modes.
- Record IDs (`ctx_` + UUIDv4 hex) and vault identity (resolved path, device and
  inode) are stable. A copied, moved or recreated vault invalidates prepared
  previews.
- Core is the only writer. Every write holds the vault lock (`.whyve-runtime/`),
  checks each touched file with compare-and-swap against the frozen preview,
  re-checks project settings, registry and runtime, and writes records and
  indexes through one persisted undo journal with atomic renames. A failed write
  restores the previous bytes. `commit_sync_failed` (`details.applied:true`)
  reports a completed write whose final directory flush failed.
- An interrupted process needs explicit dead-owner recovery
  (`whyve runtime recover`); a live writer is never evicted because of age.
  This is a local-filesystem protocol for one OS user, not distributed storage.
- Output stays one JSON envelope with stable error codes and exit codes 0, 2, 3,
  5, 6 and 1.

## Removed surfaces

Whyve 0.3.0 removes the 2.x semantic-owner transport. None of these are accepted:

- candidates, attestations and assertions with evidence pointers, same-claim
  digests, owner results, capture batches and routing;
- `whyve-preview/v1` previews, `whyve-receipt/v1` receipts, approval digests and
  receipt files; pending 2.x previews must be recreated;
- lexical `recall`/`search` scoring, `checkDecision`, `compareDecision`,
  `specView`, `revisitDecisions`, `--known-current` hints, `inspect`, and the
  owner-specific `*_workflow.mjs` commands;
- `captured_from`, `search_terms`, `source_refs` and the per-kind key headers
  (`decision_key`, `intent_key`, `document_key`, `term_key`) in new records.

Their replacements: `list` (exact filters with coverage and pages),
`searchHeaders`, `read` with byte pages, `compare` + caller judgments +
`prepare` + `apply`, a common `key` header and `## Sources` lines. Missing
evidence, rationale or alternatives are quality flags instead of rejections.

## v2 read compatibility

A `context-common/v2` vault opens read-only: `status` reports
`format: "context-common/v2"` and `writable: false`; `list`, `read` and
`searchHeaders` work on it and `read` returns `format: "context-common/v2"`.
Writes, `refresh --fix` and initializing new areas return `migration_required`.
Loading never rewrites a v2 file.

## Migration

`whyve migrate-project PATH --to-format context-common/v3 --plan-dir DIR` is the
only path from v2 to v3. It is explicit and reversible:

1. `--dry-run` freezes a plan (`whyve-format-migration-plan/v1`) with every
   before/after byte, renamed paths, link rewrites, warnings and blockers.
2. `--apply-plan FILE` re-checks the inventory under the vault lock, backs up
   the originals to `DIR/backup-<plan>`, applies one journaled transaction and
   verifies IDs, states, relations, archives and index round trips.
3. `--rollback-plan FILE` restores the backup when the vault is still exactly
   the migration result.

`--ref-headers howse` (default) maps `howse:*` source references to `howse.*`
headers; `none` keeps them as Sources lines. `captured_from` is dropped. Migrated
records carry `authorization_source: "legacy"` and `authorization_unverified`;
a record without scope gets scope `global` and `legacy_scope_defaulted`. See
[MIGRATION](../MIGRATION.md) for the operator steps.

The separate `whyve migrate-project PATH [--dry-run]` without `--to-format`
still converts a Bobbin project's `.bobbin/` settings to `.whyve/`.

## Legacy runtime handover

If a Python-era lock file exists, the CLI reports `legacy_runtime_conflict`.
Stop every Python writer, then run
`whyve runtime adopt --vault DIR --confirm-legacy-stopped` (and `--project DIR`
when project and vault differ). Mixed Python/Node writers are unsupported.

## Unicode

Normalization and case folding follow Unicode 15.1 independently of the Node or
Electron version. Stored text keeps its original spelling; canonical JSON uses
NFC and file digests bind exact rendered bytes.

## Validation

- `npm test`: record model, rendering and parsing, slots, lifecycle, review gate,
  authorization modes, CAS and concurrent processes, recovery, v2 reads and the
  format migration, and the shipped skill examples.
- `npm run test:package`: packs the real tarball, installs it offline into an
  independent consumer, type-checks the declarations, uses CommonJS and ESM,
  runs the consumer and plugin wrappers with an empty `PATH`, and runs the
  guidance test against the installed package. `WHYVE_TEST_NODE`,
  `WHYVE_TEST_ELECTRON` and `WHYVE_TEST_ASAR` optionally add runtimes.

Not verified: Windows, distributed or network filesystems, power loss and live
model behavior of the installed plugin.
