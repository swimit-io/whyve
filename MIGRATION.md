# Whyve 2.4 → 0.3.0

Whyve 0.3.0 is a breaking release. The product version restarts at 0.3.0; the
record protocol becomes `context-common/v3` (record schemas `context-<kind>/v2`,
area index `context-area-index/v2`, root index `context-root-index/v2`).
Existing 2.x vaults stay readable, and writing to them requires the explicit
format migration below.

## API and CLI changes

| 2.4 | 0.3.0 |
|---|---|
| `createCandidate`, `createAttestation`, `preview(operation)`, `apply(preview, authorization)` | `prepare({mutation, authorization, comparison?, semanticReview?})` then `apply(handle)` |
| `prepareSameClaim`, same-claim attestations | `compare({record, action:'supersede', targetId})` + a `replace` judgment in `semanticReview` |
| `recall`, `search`, lexical scores | `list` with exact filters and coverage, `searchHeaders` |
| `checkDecision`, `compareDecision`, `--known-current` | `compare` (complete bodies and a comparison receipt) |
| `checkSlot(probe)` | `checkSlot(record, options)` |
| `specView`, `revisitDecisions`, `inspect`, `route`, `previewOwnerResult`, `registerArea` | removed; use `list`/`read` |
| `*_workflow.mjs record/preview/apply`, `--receipt-file`, `--approved-digest` | `<kind>_cli.mjs prepare --input FILE --approved --apply` |
| `--approval-source policy --policy-decision … --policy-reason …` | `--policy-decision record|ask --policy-reason …` |
| `read` → `frontmatter`, `do_not_follow`, `truncated` | `read` → `headers`, `doNotFollow`, `complete`/`nextCursor`, `contentDigest` |
| `decision_key`, `intent_key`, `document_key`, `term_key` | one `key` header |
| required evidence, rationale, alternatives | optional; missing ones become quality flags |

Every write still needs user or configured-policy authorization. `explicit` mode
returns `needs_approval` for policy authorization; finish it with
`prepare({preparedHandle, authorization:{source:'user'}})`. A write that touches
existing records returns `needs_review` until the caller compares and judges
them. Pending 2.x previews and receipts (`whyve-preview/v1`, `whyve-receipt/v1`)
are not accepted: reassess and prepare again after upgrading.

## Vault migration

1. **Stop all writers.** Close every host session and application that writes
   the vault (including other Whyve versions). The migration takes the vault lock
   but cannot stop an old runtime from writing after it finishes.
2. **Dry-run.** Choose a plan directory outside the vault's `context/` and
   `.whyve-runtime/`:

   ```sh
   whyve migrate-project /path/to/vault --to-format context-common/v3 --plan-dir /path/to/plans --dry-run
   ```

   The result lists `plan_file`, a summary (records by kind, renames) and
   `warnings`/`blockers`. Nothing in the vault changes.
3. **Review.** Resolve every blocker and create a new plan; a blocked plan cannot
   be applied. Read the warnings (for example path mentions inside code blocks
   that were left unchanged) and the planned renames. `captured_from` is dropped;
   `source_refs` become Sources lines, and with `--ref-headers howse` (default)
   `howse:*` references map to `howse.*` headers such as `howse.thread`
   (`--ref-headers none` keeps them as Sources lines). Migrated records get
   `authorization_source: "legacy"` and the `authorization_unverified` flag; a
   record without a scope gets `global` and `legacy_scope_defaulted`.
4. **Apply.**

   ```sh
   whyve migrate-project /path/to/vault --to-format context-common/v3 --plan-dir /path/to/plans --apply-plan /path/to/plans/whyve-migration-<plan>.json
   ```

   It refuses a vault that changed after the dry-run (`stale_input`), backs up
   every original to `/path/to/plans/backup-<plan>/`, writes one journaled
   transaction and returns a `verification` summary.
5. **Verify.** `whyve status` shows `format: "context-common/v3"` and
   `writable: true`; `whyve doctor` returns `ok: true` with the expected record
   count. Commit the result if the vault is under Git.
6. **Rollback** (only if needed, before any new write):

   ```sh
   whyve migrate-project /path/to/vault --to-format context-common/v3 --plan-dir /path/to/plans --rollback-plan /path/to/plans/whyve-migration-<plan>.json
   ```

   Rollback is refused once the vault changed after the migration, because a
   restore would lose those writes.

Then update the plugin, reload the host, and re-run `$whyve:init --host …` so
the managed `AGENTS.md`/`CLAUDE.md` block describes the 0.3 flow.

If old `context-*` providers are still installed, disable them first; do not run
both generations together.

# Whyve 2.3 → 2.4

No record, index or settings migration. `list`, `checkSlot`, `whyve list`, `whyve slot`
and the normalization exports are additive; existing calls return the same results.
Callers that parsed `context-entry` index rows or re-implemented scope/key
normalization or slot occupancy can switch to these APIs.

# Bobbin 2.x → Whyve

Bobbin is renamed Whyve without compatibility aliases. Vault records (`context/`)
and their `context-*` schemas do not change.

1. Stop every writer, then convert each consumer project in place:
   `whyve migrate-project PATH --dry-run`, then without `--dry-run`. The command
   moves `.bobbin/` to `.whyve/`, sets the schema to `whyve-project/v1`, removes an
   empty `.bobbin-runtime/`, refreshes the managed `context-core-policy` block in
   `AGENTS.md`/`CLAUDE.md` and the runtime entry in `.gitignore`. It refuses a
   pending `.bobbin-runtime/transaction.json`, a non-empty runtime directory, or a
   project that has both folders. An untracked `.bobbin/` is kept as
   `.bobbin.bak-<timestamp>`; a Git-tracked one is restored with `git revert`.
2. Replace `@bobbin/context` with `@whyve/context` and rename `createBobbin`,
   `Bobbin`, `BobbinOptions`, `BobbinError`, `toBobbinError` and `BOBBIN_*`
   environment variables.
3. Remove the `bobbin@bobbin` plugin and marketplace, then add
   `https://github.com/Jeis-Jw/whyve.git` and install `whyve@whyve`. Skills are
   now `whyve:*`. Re-run `$whyve:init` only when you want to change settings.
4. Pending previews and receipts (`bobbin-preview/v1`, `bobbin-receipt/v1`) are
   not accepted; recreate them after the migration.

# Bobbin 2.0.0 — TypeScript core / CLI transition

Use Node.js 20.20.0+ and the packaged `.mjs` entrypoints. Existing records do not
need migration. Stop Python writers before the exclusive handover and recreate
pending previews. Read the [current compatibility contract](docs/compatibility.md)
and [library API](docs/node-api.md) before changing runtime. The historical
release notes below remain for provenance.

# Bobbin 1.0.0 transition

Bobbin replaces the six independently installed `context-*` packages with one
`bobbin@bobbin` package. Its single public version is 1.0.0. The canonical source
is `Jeis-Jw/bobbin`, and the primary local checkout is named `bobbin/`. Update
existing clones with `git remote set-url origin https://github.com/Jeis-Jw/bobbin.git`.
GitHub's old repository URL redirects to the same repository; do not reuse that
old name for another repository. Prior release tags and commit history are retained.
Installed-host changes and tag/Release publication remain separate actions.

1. Keep a normal backup/versioned copy of the consumer vault and host settings.
2. Disable all old context providers in the chosen host. Do not enable both
   generations, including copies from `jeis-ai-plugins` or other marketplaces.
3. Add the Bobbin checkout marketplace and install `bobbin@bobbin` once. The
   optional `scripts/install_profile.py --host codex --dry-run` inspects collisions;
   omitting `--dry-run` is an explicit installation action, never part of init.
4. Reload/start a new host session. Run `$bobbin:init` in each consumer project.
   The first init imports registered semantic areas with `explicit` approval.
   Choose `auto` or `adaptive` explicitly if wanted; no silent policy switch occurs.
5. For a shared vault, pass `--project PROJECT --vault VAULT` to
   `plugins/bobbin/skills/init/scripts/bobbin_init.mjs --host HOST`. Guidance and
   `.bobbin/config.json` belong to PROJECT; the corpus stays in VAULT.

Reinit preserves omitted choices. `--features ''` leaves built-ins only. Disabled
areas stay registered and readable, but cannot receive new records. Enabling an
area reuses the existing corpus. Pending receipts from an older runtime or a
different settings revision must be recreated; do not reuse their approval.

No artifact migration is necessary: `context-common/v2`, schema identifiers,
artifact IDs, scopes, actual bodies and lifecycle links are unchanged. Historical
`context-plugins` scopes stay historical identifiers. Do not bulk-rewrite them.

Rollback: disable Bobbin before re-enabling the prior plugins. Preserve the corpus.
The old runtime does not understand `.bobbin/config.json`; restore the previous
managed host-guidance block from backup (preserving unrelated user instructions)
or explicitly reinitialize it with the old runtime. Never leave both policies
active. New records use the existing artifact schemas and remain readable.

## Historical 0.x migration notes

The following sections describe the former multi-plugin distribution, not Bobbin setup.

### Repository extraction

### 0.15.0 Korean decision discovery

Korean lexical discovery now keeps two-syllable Hangul terms and removes a conservative set of common particles before comparing query and index terms. English stemming, decision ranking, result limits, artifact schemas, and `context-common/v2` remain unchanged.

Existing DEC artifacts and their stored `search_terms` are not rewritten or backfilled automatically. Title, summary, key, tag, and existing search terms are normalized at check time, but a body term omitted by an older recorder is unavailable to scope-less discovery if it appears nowhere in that metadata. Use an exact-slot `check` with both `--scope` and `--decision-key`, or explicitly approve an `annotate --search-term` lifecycle update for records that need the missing discovery term.

Particle stripping is intentionally dependency-free and conservative. Ambiguous suffixes `나`, `도`, and `만` are not stripped. Some longer nouns ending in a retained particle-like syllable can still normalize too aggressively; actual DEC bodies, scope, and rationale remain the only semantic comparison evidence.

### 0.14.0 generated indexes as projections

Area indexes remain committed, but an approved write no longer requires their bytes to be unchanged since preview: core re-derives the index from the artifacts under the root lock and reports `index_regenerated:<path>`. Target-artifact drift, a competing Current decision in the same or an overlapping scope/key, a slot that already holds two Current decisions, and chained same-area proposals still fail closed. Existing `context-common/v2` artifacts and indexes need no migration; pending receipts stay valid.

For Git vaults, run your host's `init` once more to add the managed `.gitattributes` block (`context/**/*.index.md merge=union`), or add that line yourself. After a merge, run `refresh --fix index` or let the next write re-derive the index; use `refresh --check` in CI. If a merge left two Current decisions in one slot, `doctor` reports `duplicate_current_slot` and only that slot holds until one record is withdrawn or superseded.

### 0.13.0 semantic approval

Capture approval now attaches to the settled semantic payload, canonical scope, and lifecycle effect expressed in conversation. The agent does not show the rendered Markdown or ask a second storage question merely to authorize persistence. If rendering introduces or changes meaning, it holds the write and confirms only that semantic delta.

Internal preview, frozen receipts, `approval_digest`, runtime/vault binding, CAS, lock, atomic write, and unchanged apply remain integrity controls. `approval_digest` is a compatibility field name, not user-approval evidence. Existing `context-common/v2` artifacts and indexes require no migration; stale pending receipts should be discarded and regenerated under the current runtime. This section supersedes the user-facing complete-preview approval contract described for historical 0.6.0/0.7.1 releases.

### 0.9.0 filesystem vaults

Storage, approval, and installation no longer require Git. A vault is an existing directory containing `context/`. Use global `--vault DIR` before core, owner, or workflow subcommands, or the same option on addon init adapters. Without it, the nearest current/ancestor `context` directory selects the vault; with none present, init uses cwd. Input file paths still resolve relative to the caller's cwd.

Existing Markdown artifacts, IDs, and indexes remain `context-common/v2` and require no migration. Core advertises `filesystem-vault/v1`; updated addon init/workflow rejects an older core lacking that feature before storage commands. Keep core and the addons using this contract together.

Approval material now uses `vault_identity` with `context-vault-identity/v1` and the vault's resolved path/device/inode. Old pending bundles and receipts cannot be replayed; discard them and obtain a fresh preview and approval. Copying or moving saved context remains supported, but pending approvals never move with it. Git metadata and branch changes do not affect approval validity.

The profile installer accepts ordinary downloaded directories, including archive extracts. It no longer requires a release tag or a clean checkout, and `--allow-unreleased-checkout` is removed. Profile/manifest/catalog checks and host collision guards remain.

Rollback preserves saved artifact bytes. Do not reuse pending approval material after changing runtimes; the old runtime does not support `--vault` and may still require Git. The historical W2 description below is superseded by this vault contract.

### Source provenance

- Source repository: `Jeis-Jw/ai-plugins`
- Source commit: `eea43c9386735aa6141203a8a8912b0256746a64`
- Extracted paths:
  - `plugins/context-core/**`
  - `plugins/context-decision/**`
  - `tests/context-v1/**`
  - required host marketplace manifests and pytest configuration

The new repository starts with a clean import commit. This avoids publishing unrelated plugin history while retaining an exact source anchor for audit and comparison.

### Distribution migration

| Field | Previous | New |
|---|---|---|
| marketplace | `jeis-ai-plugins` | `context-plugins` |
| core selector | `context-core@jeis-ai-plugins` | `context-core@context-plugins` |
| source | `Jeis-Jw/ai-plugins` | `Jeis-Jw/context-plugins` |
| plugin version | `0.3.0` | `0.4.0` |
| protocol | `context-common/v2` | `context-common/v2` |

The coordinate change is a breaking distribution migration even though the storage protocol remains `context-common/v2`. Existing installations are not modified automatically. The GitHub source repository is public; marketplace publication, installation, reload, temporary-consumer bootstrap and rollback verification remain separate release work.

### Knowledge boundary

The source repository's `wiki/` and `context/` corpus are not imported. This repository initializes a fresh `context/` root and decision area; any non-init DEC or OBS requires semantic confirmation of its content, scope, and lifecycle effect. Rendered storage bytes remain internal integrity material.

### 0.5.0 additive semantic owners

`0.5.0` adds optional `context-assumption` and `context-term` plugins plus the generic `context-owner-descriptor/v2` registration path. The storage protocol remains `context-common/v2`; existing SNAP, OBS and DEC artifacts are not rewritten.

Users install only the owners they need and explicitly run each installed addon's init. No plugin automatically installs, enables, updates or initializes another plugin. Existing notes, assumptions, glossary files or older context artifacts are not inferred or migrated into ASM/TERM automatically; each durable artifact still requires its own semantic review and complete preview confirmation.

Rollback is distribution-level: stop using or uninstall the optional addon while leaving its repository artifacts untouched. Automatic downgrade, descriptor mutation, area deletion and corpus cleanup are not provided.

### 0.5.1 W1-W3 hardening

`0.5.1` keeps `context-common/v2` and existing artifact bytes while tightening the executable and approval boundaries. It requires no storage migration and is a new release identity distinct from existing `0.5.0` bytes.

- W1 reduces the Codex prompt character surface, adds a one-command inline DEC preview and a frozen out-of-repository receipt, and makes healthy index misses open zero indexed bodies while capping recovery body opens at 20.
- W2 binds both core and workflow approval material to exact worktree/Git-common-dir identity, pins the distributed `context_cli.py` path suffix and SHA-256 before execution, and performs the core schema/protocol/command/feature/doctor handshake directly. This executable check is not marketplace provenance, catalog source or enabled-state attestation; caller inventory remains a low-level compatibility input.
- W3 applies actual semantic input limits (DEC 1,200 codepoints, common primary claim 2,000 codepoints, owner input 8 KiB, full candidate envelope 16 KiB). Core and DEC `--sec-*` values use literal, `@file` and `@@literal` behavior; ASM and TERM use structured `--candidate @file` input.

Frozen workflow receipts contain decision material. They remain outside the vault with mode `0600`; reusing one across a copied, moved or same-path recreated vault fails before writes. The agent owns this transport lifecycle rather than asking the user to manage it.

No storage migration is required. Existing callers of `--core-inventory` and `--core-doctor` may keep using the low-level compatibility surface, but canonical addon init and DEC workflow should provide the loaded same-major `--core-cli` instead.

### 0.6.0 natural-language approval UX (unreleased)

The 0.6.0 user contract shows one complete rendered preview and asks one natural-language capture question. Only a direct, explicit, unconditional affirmative answer authorizes apply; `알겠어` alone, conditions, edit requests, and topic changes do not. Digests, receipt locations, internal IDs, and core paths remain agent/CLI transport details.

The wording and workflow changes ship as one release unit. Frozen receipt, approval binding, repository identity, pinned core SHA, CAS, lock, atomic writes, and no-regeneration-after-approval remain unchanged. No storage migration is required.

### Core-based extension packaging

`context-core`, `context-decision`, `context-assumption`, and `context-term` remain separate plugin packages. Core owns storage, indexes, transaction validation and physical writes; semantic owners keep their schemas, actual-body comparison and lifecycle meaning. The rejected topology spike copied decision into core, but none of those bytes are part of the 0.6.0 release candidate.

For fresh core+decision installs, the distribution directory contains `profiles/core-decision.json` and `scripts/install_profile.py`. One explicit installer invocation asks the host to register that directory and install core followed by decision at the same version and selected scope. This is distribution tooling, not a plugin dependency or runtime auto-install path. It does not initialize repositories, migrate corpus, remove old coordinates, replace an existing marketplace, or roll back partial host changes automatically.

An enabled `context-core@jeis-ai-plugins` or `context-decision@jeis-ai-plugins`, an existing `context-plugins` marketplace pointing at another checkout, a disabled target plugin, or a mixed target version fails before the installer mutates host state. The user must explicitly disable, uninstall or update those coordinates and then rerun the installer from a compatible distribution directory. Repository artifacts remain untouched throughout distribution migration.

### 0.8.0 major-based package compatibility

`0.8.0` changes the distribution policy without changing `context-common/v2` storage. Package major is the compatibility boundary, minor versions carry functional changes, and patch versions carry small fixes. This project applies that rule to pre-1.0 versions as well, so `0.*` packages pass the version gate together.

The profile schema is `context-plugin-profile/v2` with `compatibility: same-major`. The installer accepts enabled same-major plugins, installs only missing profile members, and does not auto-update compatible installations. Disabled plugins, different majors, the legacy provider, and another marketplace checkout still fail before host mutation.

Semantic addons no longer carry a release-wide hardcoded core byte digest. They verify the core entrypoint suffix and adjacent host manifests, require the same major, perform the existing schema/protocol/capability/command/doctor handshake, and bind the actual executable digest for each init operation or frozen DEC preview/apply lifecycle. No repository artifact migration is required.
