# Node.js core and CLI

Whyve 0.3.0 provides a reusable TypeScript core for the `context-common/v3`
record convention. One `@whyve/context` package contains the core, compiled CLI,
type declarations and agent entrypoints. It needs Node.js **20.20.0 or newer** and
has no runtime dependencies or native addons, and doesn't require Python,
Electron, Git, a plugin installation, or network access. The normative record format is
[docs/record-model.md](record-model.md); `whyve schema [KIND]` prints it as JSON.

## Install a local package

```sh
# In the Whyve checkout; development dependencies are needed only here.
npm ci
npm test
npm pack --pack-destination /path/to/packages

# In an independent consumer. This installs the tarball, not a checkout symlink.
npm install /path/to/packages/whyve-context-0.3.0.tgz
npx --no-install whyve init --vault /path/to/existing/vault --features decision,intent,document
npx --no-install whyve list --vault /path/to/existing/vault --kind decision
```

A global CLI install from the same tarball is also supported. The package is not
published to npm yet. The plugin checkout ships compiled
`plugins/whyve/dist/`; its `.mjs` scripts import the same CLI.

## Host API

```ts
import { createWhyve } from '@whyve/context';
import type { RecordInput } from '@whyve/context';

const whyve = createWhyve({ vault: '/path/to/vault', project: '/path/to/project' });
// Run setup only when the user chooses or changes project configuration.
await whyve.initialize({ features: ['decision'], approvalMode: 'explicit' });

const record: RecordInput = {
  kind: 'decision', title: 'Store records as local files', scope: 'app/storage', key: 'storage-backend',
  body: { decision: 'Store records as local Markdown files.', rationale: 'The app must work offline.' },
  headers: { 'howse.thread': 'thread/0ba5' },
};
let result = await whyve.prepare({ mutation: { action: 'capture', record }, authorization: { source: 'user', references: ['msg/d385'] } });
if (result.status === 'needs_review') {
  // Existing records must be judged by the caller's model from their full bodies.
  const page = await whyve.compare({ record });
  const judgments = page.items.filter(i => i.mandatory).map(i => ({ id: i.row.fields.id, judgment: 'separate' as const, reason: 'Different question (judged from the body).' }));
  result = await whyve.prepare({ mutation: { action: 'capture', record }, authorization: { source: 'user' }, comparison: page.receipt, semanticReview: { judgments } });
}
if (result.status === 'prepared') {
  const receipt = await whyve.apply(result.handle);   // { status: 'applied', recordId, changedPaths, qualityFlags, … }
  const page = await whyve.list({ kinds: ['decision'], scope: { value: 'app', match: 'overlap' } });
  console.log(page.items.map(row => row.fields.title), (await whyve.read(receipt.recordId)).sections.Decision);
}
```

[The runnable consumer](../examples/consumer.cjs) does this end to end and reads
the same vault through the CLI with an empty `PATH`.

A library caller supplies `vault` and optionally `project` (`project` selects
`.whyve/config.json`; with only `project`, its configured vault is used). The core
never changes `process.cwd()` or environment variables. Directories must exist and
be writable by the calling OS user. Reads take the vault lock so they never observe
an interrupted transaction; the protocol coordinates processes of one user and is
not a multi-user access service.

| Method | Contract |
|---|---|
| `capabilities()` | Version, protocol, kinds, limits, regex subset, methods. |
| `status()` | Vault format (`context-common/v3`, `context-common/v2`, `uninitialized`), `writable`, mode, enabled and registered kinds, index digest. |
| `list(options)` | Index rows with exact filters: `kinds`, `state`, `scope {value, match: exact|ancestor|descendant|overlap}`, `key`, `keywords {values, match}`, `ids`, `textContains` (substring of title or summary), `created`/`updated` ranges, `headers {conditions, match}`; `order`, `limit` (≤ 100), `cursor`. Returns `items[{fields, rawLine}]`, `coverage`, `nextCursor`. No ranking, no body reads (header conditions scan headers). |
| `searchHeaders(options)` | Reads header blocks only; conditions `eq`, `contains`, `regex` (RE2-like subset, flag `i`); `select` returns values (`howse.*`). Pages of up to 500 files. |
| `read(id, {sections?, maxBytes?, cursor?, raw?})` | Stored sections, sources, headers, quality flags, `authority`, `doNotFollow`, `lifecycle`, `contentDigest`. Large bodies page with `nextCursor`; `complete` indicates whether the whole body was returned. |
| `checkSlot(record, {existingId?, supersedeId?})` | Advisory slot occupancy with the same rule prepare and apply enforce. |
| `compare({record, action?, targetId?, expand?, maxBytes?, cursor?})` | Mandatory comparison set (supersede target, slot occupants, typed references) with complete bodies, optional expansion, and a `receipt` binding what was read. |
| `validateReadReceipt(receipt)` | Whether the compared files are still unchanged. |
| `prepare({mutation, authorization, comparison?, semanticReview?})` | Validates, renders and freezes a preview: `prepared`, `needs_approval`, `needs_review` or `needs_archive`. |
| `prepare({preparedHandle, authorization})` | Completes a `needs_approval` preview with new authorization; the frozen mutation is re-planned, not rebuilt from new meaning. |
| `apply(handle)` | Re-checks settings, registry, runtime, previews and file digests under the vault lock, writes records and indexes in one journaled transaction. Repeating returns `already_applied`. |
| `initialize`, `settings`, `refresh(fix?)`, `recoverRuntime`, `adoptLegacy` | Setup, configuration, integrity check and index rebuild, crash recovery, legacy runtime handover. |

Mutations: `capture {record, id?}`, `update {id, expectedDigest, patch}`,
`supersede {id, expectedDigest, successor, reason, successorId?}`,
`retire {id, expectedDigest, reason, note?, sources?}`, `discard {id, expectedDigest}`
and `rename {id, expectedDigest, title}`. `expectedDigest` is the `contentDigest`
from `read` or `compare`. Body fields and limits per kind come from
`MODEL`/`whyve schema`. Missing optional sections (rationale, evidence,
alternatives, …) are returned as `qualityFlags` and never reject a write. A body
over 256 KiB returns `needs_archive` with suggested ARCHIVE chunks.

## Project settings

A project's settings live in `.whyve/config.json`, separate from the generated
`AGENTS.md`/`CLAUDE.md` guidance and the record index. Several projects may share
one vault while keeping their own feature and approval settings. Re-running
`$whyve:init` preserves choices you leave out; existing projects keep explicit
authorization and import their registered features.

## Semantic review

The core never infers meaning from scores or hashes. When a capture or supersede
has mandatory comparison records, `prepare` returns `needs_review`
(`comparison_required`, `comparison_incomplete`, `judgment_required`,
`predecessor_not_replaced` or `semantic_conflict`). The caller runs `compare`,
has its model judge each mandatory record `same | separate | support | conflict
| replace | unclear` from the delivered bodies, and prepares again with the
receipt and judgments. A supersede target must be `replace` (or `same`); every
other mandatory record must be `separate` or `support`. The receipt's reads and
index preconditions become preconditions of the prepared write, so a change in
between returns `stale_reference`. With no mandatory records a write needs no
comparison.

## Authorization

Every write needs `{source:'user', references?, meaning?}` or
`{source:'policy', decision:'record'|'ask', reason}`. User authorization is
accepted in every mode. In `explicit` mode (or without a config) policy
authorization returns `needs_approval`; `auto` and `adaptive` accept
`decision:'record'` for the configured vault, and `ask` returns `needs_approval`.
Complete it with `prepare({preparedHandle, authorization:{source:'user'}})`.
Authorization is a trusted caller assertion, not an authentication service; the
record stores `authorization_source` and an `authorization` source line.

## CLI

Every command prints one JSON envelope `{"ok":true,"result":…}` or
`{"ok":false,"error":{"code","message","details"}}`; exit codes are 0 success,
2 usage or schema, 3 not found, 5 conflict or approval, 6 integrity, 1 unexpected.
`whyve KIND COMMAND …` narrows `list`/`search-headers` to one kind and
`whyve KIND init` enables that feature.

```sh
whyve list --kind decision --scope app --scope-match overlap --key storage-backend
whyve read ctx_… --section Decision
whyve compare --input compare.json            # {record, action?, targetId?, expand?}
whyve prepare --input write.json --approved --reference msg/d385 --apply
whyve prepare --input write.json --policy-decision record --policy-reason 'verified test result'
whyve prepare --input handle.json --approved --apply   # {"preparedHandle":"prep_…"}
whyve apply prep_…
whyve search-headers --header-regex 'howse.thread=^thread/' --select 'howse.*'
whyve refresh --fix
```

`--input -` reads JSON from stdin. `--approved` and `--policy-*` override an
`authorization` object in the input file.

## Errors and recovery

Library errors are `WhyveError` with `code`, `details`, `exitCode` and
`envelope()`. Common codes: `digest_conflict` (record changed since read),
`stale_reference` / `stale_input` (compared or target bytes changed),
`project_policy_changed`, `feature_disabled`, `approval_required`,
`migration_required` (v2 vault), `cursor_invalid` / `cursor_stale`.
`commit_sync_failed` reports `details.applied:true` when every write completed but
the final directory flush failed. If a writer is killed, `recoverRuntime()` /
`whyve runtime recover` verifies that the writer's process is no longer running
and rolls back the journal.

## Electron

Install the tarball as a production dependency and use the library from the main
process, a utility process or a Node worker (preferable for large vaults; file
work is synchronous, lock waiting is asynchronous). Route renderer access through
your own IPC. Keep the writable vault outside the read-only ASAR; Whyve needs no
`asarUnpack` or native rebuild.
