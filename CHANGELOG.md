# Changelog

Whyve (formerly Bobbin) has one public package version. The historical 0.2.0–0.15.0 entries at the end describe Context Plugins release sets, whose component versions could differ; Whyve 0.3.0 (2026-09-26) restarts the product line and is unrelated to the historical Context Plugins 0.3.0. Source preparation, tags and publication remain separate states.


## 0.3.0 — Plain records, caller-judged meaning — 2026-09-26

Breaking. The product version restarts at 0.3.0; the protocol is
`context-common/v3` (record schemas `context-<kind>/v2`, indexes
`context-area-index/v2` and `context-root-index/v2`). See [MIGRATION](MIGRATION.md).

- New normative record model ([docs/record-model.md](docs/record-model.md)) that
  generates the runtime model: flat compact-JSON headers, a common `key`, fixed
  sections with Korean aliases, a final `## Sources` list, namespaced host
  headers (`howse.thread`), `YYYY-MM-DD-title.md` names (DOCUMENT and TERM:
  `title.md`) and plain Markdown index rows.
- New host API `WhyveHost`: `capabilities`, `status`, `list`, `searchHeaders`,
  `read`, `checkSlot`, `compare`, `validateReadReceipt`, `prepare`, `apply`.
  Writes are `prepare` → `apply(handle)`; `prepare` returns `prepared`,
  `needs_approval`, `needs_review` or `needs_archive`, and `apply` is idempotent.
- Meaning is judged by the caller: `compare` delivers the mandatory records
  (supersede target, slot occupants, typed references) with complete bodies and a
  comparison receipt; `prepare` requires a `same|separate|support|conflict|replace|unclear`
  judgment for each. A capture with no mandatory records needs no comparison.
- Missing evidence, rationale, alternatives, success criteria or summary are
  quality flags, never rejections. Bodies over 256 KiB return `needs_archive`
  with suggested ARCHIVE chunks.
- Discovery is exact: `list` filters with coverage and cursors; `searchHeaders`
  reads header blocks with `eq`/`contains`/regex conditions. Lexical recall and
  scoring are removed.
- Authorization is unchanged in spirit: user or configured policy for every
  write; explicit mode returns `needs_approval` for policy authorization, finished
  with `prepare({preparedHandle, authorization})`.
- Removed: candidates, attestations, assertions and evidence pointers, same-claim
  digests, approval digests and receipt files, `*_workflow.mjs`, `recall`,
  `search`, `checkDecision`, `compareDecision`, `specView`, `revisitDecisions`,
  owner routing and area registration.
- `context-common/v2` vaults are readable; writing requires
  `whyve migrate-project PATH --to-format context-common/v3` with dry-run,
  apply-plan (backup, journaled apply, verification) and rollback-plan.
- Skills, rules, templates, managed guidance and docs describe the new flow with
  JSON input files; the shipped decision examples are executed by the tests.

## 2.4.0 — Metadata listing, slot pre-check and public normalization — 2026-09-26

- Add `list(options)` / `whyve list`: paged index metadata for any registered kind,
  filtered by area, state, canonical scope (exact or overlap) and the kind's own key.
  Coverage separates queried and unqueried areas, reports counts without claiming a
  complete read, and marks damaged areas as partial in tolerant mode. No body reads.
- Add `checkSlot(probe, options)` / `whyve slot`: advisory owner-slot occupancy with
  acknowledgement, prospective ID, existing-record and supersede-target handling.
  It shares one extracted pair rule with apply-time `validateSlots`, whose results
  are unchanged. Different kinds never occupy each other's slots.
- Both return stateless cursors bound to vault, request and selected set;
  `cursor_invalid` and `cursor_stale` distinguish a foreign cursor from a changed set.
- Export `canonicalScope`, `canonicalKey` and `scopesOverlap` without changing them.
- The previously unreleased Whyve rename below ships in this version.

## Whyve rename (included in 2.4.0)

- Rename the package to `@whyve/context`, the CLI to `whyve`, the plugin and
  marketplace to `whyve` (`whyve@whyve`, skills `whyve:*`), the API to `Whyve`,
  `WhyveOptions`, `WhyveError`, `createWhyve` and `toWhyveError`, and the
  repository to `Jeis-Jw/whyve`. No alias exports remain.
- Read project settings only from `.whyve/config.json`; use `.whyve-runtime/`,
  `whyve-*` schema IDs and `WHYVE_*` environment variables. `.bobbin` is not read.
- Add `whyve migrate-project PATH [--dry-run]` to convert a Bobbin 2.x project in
  place. `context-*` record schemas, owners and vault records are unchanged.

## 2.3.0 — Scoped decision comparison — 2026-09-10

- Add `compareDecision()` and `decision compare` with required scope and decision key.
  Use metadata-only `search` for unknown coordinates; include all same-key required
  candidates in related scopes and read optional bodies only for distinctive matches.
- Share candidate selection, body loading and reference transport with legacy `check`,
  preserving its selection policy and full/delta response contracts.
- Return one `context-decision-compare/v1` envelope with body references, lifecycle
  links, digests and scoped omission warnings. Publish static assessment rules through
  `decision schema` and the EN/KO skills instead of repeating them in every response.
- Reuse records already loaded by preview for unchanged-reference preconditions.
  Keep apply-time validation, approval binding, concurrent-change detection and recovery.
- Validate search body reads, required coverage, stale hints and context-loss fallback,
  compatibility and installed-package consumers. Synchronize default guidance and docs.

## 2.2.0 — Opt-in decision body reuse — 2026-09-09

- Add `knownCurrent` and repeated `--known-current ID:SHA256` hints for callers
  retaining complete actual DEC sections. Unchanged bodies return references;
  changed files and new Current records return fresh sections and lifecycle links.
- Keep default full output unchanged. Opt-in delta schemas distinguish the emitted
  transport digest from the hydrated comparison digest, with full reads and limits intact.
- Verify malformed/stale hints, successor handling, no-write reads and digest
  reconstruction in the source runtime and installed package; document EN/KO fallback rules.

## 2.1.1 — Decision guidance and history navigation — 2026-09-09

- Complete DEC supersede examples with same-claim attestation after actual
  body, scope and rationale comparison. Explain missing attestation errors
  without weakening semantic validation or inferring approval.
- Add `current_links` to decision checks without changing the existing
  comparison input or digest. Reuse applicable actual bodies and read History
  by stable ID, including its actual path and historical authority.
- Expose OBS evidence count and codepoint limits beside its examples, and
  update the shared recording policy to the shipped `.mjs` workflow.
- Clarify validated record-management behavior and unestablished model-cost
  advantages. Verify the EN/KO examples and history navigation in both the
  source runtime and the installed package.

## 2.1.0 — SNAP storage — 2026-09-09

- Allow SNAP logical input up to 256 KiB (262,144 UTF-8 bytes), with one size
  check for CLI/Node creation and full or merged updates. Remove SNAP-only
  content character, paragraph and list limits; retain metadata and reference
  validation, other record limits and search/recall budgets.
- Preserve Markdown, Unicode, indentation and trailing spaces; normalize CRLF
  to LF. Use section framing only when needed for lossless round trips, while
  retaining existing legacy SNAP reads without automatic migration.
- Accept raw Markdown from CLI files or stdin and JSON arrays for multiline
  list items. Oversize errors report actual and allowed bytes without automatic
  shortening, splitting or partial record/index writes.
- Older runtimes may not read newly framed or larger SNAPs reliably; use the
  updated runtime for those records.

## 2.0.0 — Shared TypeScript core — 2026-09-08

- Replace the Python product runtime with one reusable TypeScript core, Node CLI,
  and packaged Agent plugin adapters. Node.js 20.20.0+ is required; Python, Git,
  Electron and global plugin installation are not runtime dependencies.
- Ship `@bobbin/context` with CommonJS/ESM imports and TypeScript declarations;
  CLI and library share the same operations, errors and sole-writer implementation.
- Preserve all eight artifact kinds, stored IDs, text, scopes, lifecycle links,
  selective recall and project recording modes. ASM successors now retain supplied
  optional metadata that the former Python builder omitted.
- Introduce `Operation`, `bobbin-preview/v1` and private `bobbin-receipt/v1` inputs.
  Old Python mutation bundles and pending receipts are not executable Node inputs.
  The new runtime and transport requirements make this a major version change;
  stored `context-common/v2` schemas and owner descriptor hashes remain unchanged.
- Coordinate callers with a vault-local lock, compare-and-swap checks, durable
  rollback journal and explicit dead-owner recovery. Python-to-Node handover is
  exclusive; mixed runtime writes are unsupported.
- Validate actual package consumers, plugin commands, Node 20/24, Electron and
  ASAR execution, plus fixed-input Python/TS and Unicode 15.1 comparisons. The
  former Python source is frozen as a development-only comparison reference.
- Keep source push, tags, npm publication and marketplace submission separate.
  See [migration and limitations](docs/compatibility.md).

## 1.0.0 — Bobbin — 2026-09-05

- One Bobbin package and version for Codex and Claude Code; semantic owners remain
  internal modules around the same sole-writer core.
- Project-local feature selection and idempotent `$bobbin:init` with legacy-area
  import, shared-vault isolation and non-destructive feature toggles.
- `explicit`, `auto` and LLM-assessed `adaptive` recording policies, enforced at
  the common apply boundary with frozen project-policy bindings.
- Existing Markdown artifact schemas and lifecycle are preserved. The source
  repository is now `Jeis-Jw/bobbin` (formerly `Jeis-Jw/context-plugins`), with the
  same repository identity and retained history. The primary checkout, remote,
  source coordinates and current documentation use Bobbin. Host installation,
  tags and marketplace publication remain separate actions.
- Added reproducible before/after runtime measurements; see [BENCHMARKS.md](./BENCHMARKS.md).

## 0.15.0 - 2026-09-04

Release set `0.15.0` contains `context-core` 0.14.0 (unchanged), `context-decision` 0.14.0, `context-assumption` 0.12.0, `context-term` 0.12.0, `context-intent` 0.12.0, and `context-document` 0.13.0. Only the decision component changes; same-major compatibility is unchanged.

### Added

- W1: add deterministic Korean lexical discovery for short Hangul terms and common particles. English stems, query terms, and retrieval bounds are byte-identical to 0.14.0.
- W2: separate user guides, contributor guidance, release history, and reproducible evidence.
- W3: add issue and pull-request templates, security reporting guidance, and a community code of conduct.

### Fixed

- Discover record-created decisions for requests such as `로그인 붙이자`, without adding a tokenizer dependency or changing stored artifact bytes.
- Point the public-trust test at the maintained changelog and benchmark evidence after the old combined release-notes file was removed.

### Compatibility

- Existing `context-common/v2` artifacts are unchanged. Previously stored `search_terms` are not rewritten automatically; see [MIGRATION.md](./MIGRATION.md).
- Korean particle stripping is intentionally conservative. Some nouns ending in a particle-like syllable, such as `어린이`, can still normalize too aggressively. Actual-body comparison remains authoritative after lexical discovery.

## 0.14.0 - 2026-09-03

Release set `0.14.0` contains `context-core` 0.14.0, `context-decision` 0.13.0, `context-assumption` 0.12.0, `context-term` 0.12.0, `context-intent` 0.12.0, and `context-document` 0.13.0.

- Added one-call approved DEC recording and body-derived search terms with bounded inverse-frequency ranking.
- Treated generated indexes as write-time projections, added Git union-merge attributes and `refresh --check`, and kept artifact and slot conflicts fail-closed.
- Added one-call approved SNAP save/update and an explicit resume path.
- Preserved `context-common/v2`, stored artifact bytes, core-only physical writes, and separate semantic-owner packages.
- Published tag `v0.14.0`; central marketplace publication remained a separate owner gate.
- Moved measured evidence and its limitations to [BENCHMARKS.md](./BENCHMARKS.md).

## 0.13.0 - Developer preview

- Replaced the rendered-file approval screen with approval of settled semantic payload, canonical scope, and lifecycle effect in normal conversation.
- Kept frozen receipts, runtime and vault binding, CAS, locking, atomic writes, and unchanged apply as internal integrity controls.
- Preserved stored artifacts and `context-common/v2`; stale pending receipts require regeneration.

## 0.12.0 - Developer preview

- Added immutable ARCHIVE capture/read/search/discard, bounded OBS evidence references, and DOCUMENT freshness diagnostics.
- Kept ARCHIVE out of default recall unless explicitly requested and preserved existing artifact bytes.

## 0.11.0 - Developer preview

- Made OBS preview state explicit and added single-command inline preview wrappers for the optional semantic owners.
- Added a six-plugin release-set map and diagnostic same-major core candidates without automatic selection or installation.

## 0.10.0 - Developer preview

- Added typed relation validation and the optional INTENT and DOCUMENT owners.
- Kept decision, intent, and document independently usable and left `core-decision` as exactly two packages.

## 0.9.0 - Developer preview

- Made a regular filesystem directory the vault boundary and removed Git as a runtime requirement.
- Bound pending approvals to vault identity and kept copied saved context portable while preventing pending-approval replay.

## 0.8.0 - Developer preview

- Adopted same-major package compatibility, including the pre-1.0 line, while retaining runtime protocol and capability handshakes.
- Reduced static prompt material; this observation was not a token-savings measurement.

## 0.7.1 - Developer preview

- Made English canonical for runtime instructions while keeping Korean user documentation and legacy Korean artifact headings readable.
- Added natural-language approval, deterministic receipt lifecycle, discovery-only decision lookup, and the explicit root profile installer.

## 0.6.0 - Historical unreleased candidate

- Prepared a one-question natural-language approval contract over a complete rendered preview.
- Kept core and semantic-owner packages separate while using root distribution tooling to coordinate installation.
- This approval surface was later superseded by semantic approval in 0.13.0.

## 0.5.1 - Historical prepared patch

- Reduced static prompt material and bounded healthy misses, recovery reads, owner inputs, candidates, and approval previews.
- Bound approval material to vault/runtime identity and hardened exact semantic-input validation.

## 0.5.0 - Developer preview

- Added bounded DEC `spec-view`, generic `context-owner-descriptor/v2`, and optional ASM and TERM owners.
- Preserved the storage protocol and kept addon installation and artifact migration explicit.

## 0.4.1 - Developer preview

- Documented durable-context value and bounded recall, and synchronized the managed policy with its runtime-installed copy.

## 0.4.0 - Developer preview

- Moved distribution coordinates to marketplace `context-plugins` and source `Jeis-Jw/context-plugins` without changing `context-common/v2` artifacts.

## 0.3.0 - Developer preview

- Added same-pass incremental auditing, signal-gated metadata-first recall, selected actual-body reads, and a session-local read ledger.

## 0.2.1 - Developer preview

- Narrowed fail-closed checks to the actual write target and added bounded index-first recovery.

## 0.2.0 - Breaking developer preview

- Removed legacy semantic fingerprint fields and batch-local claim keys.
- Introduced the `context-common/v2` wire/storage handshake and lazy cleanup of removed fields on later approved rewrites.

## License

The repository is licensed under the [Apache License 2.0](./LICENSE). A source merge, tag, host installation, central marketplace publication, and community announcement are separate release states.
