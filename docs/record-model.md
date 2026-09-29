# Whyve record model — `context-common/v3`

This document is the normative source of the Whyve 0.3 record convention.
`scripts/generate-model.cjs` reads the fixed-column tables below and writes
`src/model.json`, which the parser, renderer, index projection, validation,
JSON schemas and host descriptors use. `npm run check` fails when the generated
file differs from this document. Prose outside the tables explains the rules;
only the tables are machine-read.

Identifiers: package `@whyve/context` 0.3.x, common protocol `context-common/v3`,
record schemas `context-<kind>/v2`, area index `context-area-index/v2`, root
index `context-root-index/v2`. Package and schema versions are independent.

## 1. Responsibilities

The core owns normalization, the kind conventions below, hard checks, quality
flags, files and indexes, filters and pages, structural comparison candidates and
body delivery, read preconditions, authorization binding, locking, atomic writes
and recovery. Meaning — whether two records say the same thing, conflict, or one
replaces another — is judged by the caller's model from actual bodies. The core
never infers meaning from scores or hashes.

## 2. File shape

```md
---
title: "Evidence is optional"
summary: "Missing evidence is shown and the record is still stored."
kind: "decision"
scope: "howse/context"
key: "evidence-optional"
keywords: ["clerk","evidence"]
created_at: "2026-09-26T06:05:03+00:00"
quality_flags: ["alternatives_missing"]
id: "ctx_0123456789ab4def8123456789abcdef"
schema: "context-decision/v2"
state: "current"
authorization_source: "user"
howse.thread: "thread/0ba5"
---

## Decision

Missing evidence is a quality flag, not a rejection.

## Sources

- authorization: msg/d385cec1
- supersedes: ctx_79a21dde38ab4b11996d68fa333333a7
```

- The header sits between `---` lines. Each line is `key: value` where the value
  is compact JSON: a string or an array of strings. Nested YAML, multi-line values,
  numbers, booleans, null and date inference are not supported. Dates are ISO
  strings. The header block is at most 16 KiB of UTF-8.
- Reserved keys use `[a-z][a-z0-9_]*`. Host keys use `namespace.name`, each part
  `[a-z][a-z0-9_-]*`, at most 80 ASCII characters. The `whyve.` namespace is
  reserved. Host keys render after reserved keys in sorted order.
- Sections are `## Name` headings in the order below. English canonical names and
  the Korean aliases are both accepted; a single file must use one style. Unregistered
  sections written by hand are preserved and render before `Sources`.
- A section whose text would not survive plain rendering (a line that looks like
  an H2 heading outside a code fence, or leading/trailing whitespace) is framed with
  `<!-- <section_delimiter> begin -->` / `end -->` lines; the core then sets the
  `section_delimiter` header. Text is otherwise stored as written.
- `## Sources` (alias `## 출처`) is always last. Each line is
  `- relation: ref` or `- relation: ref — note`. In `ref`, `\` is written `\\`
  and `—` is written `\—`; in `note`, `\` is written `\\`. Neither may contain a
  newline. Relations use `[a-z][a-z0-9_-]*` with an optional `:kind` suffix for
  typed relations such as `serves:intent`. A source line is never treated as an
  approval by itself; `authorization` entries record the reference the host
  verified.

## 3. Common headers

`class`: H is a stored value required for integrity (the core may derive it), S is
optional, D is derived and managed by the core, C is conditionally required.

| order | key | type | class | limit | rule |
|---|---|---|---|---|---|
| 1 | title | string | H | 120 | One non-empty line. |
| 2 | summary | string | S | 280 | One line. When omitted the core derives a deterministic excerpt of the primary section and adds `summary_derived`. |
| 3 | kind | kind | H | 0 | One of the kinds in section 4. |
| 4 | scope | scope | H | 160 | Canonical scope, at most 8 segments of 40 codepoints. Every kind has a scope. |
| 5 | key | key | C | 80 | Canonical key. Required when the kind declares a key. |
| 6 | keywords | string_list | S | 12x40 | Exact-item filter; projected to the area index. |
| 7 | tags | string_list | S | 12x40 | Header search only. |
| 8 | created_at | timestamp | H | 0 | Set by the core; immutable. |
| 9 | updated_at | timestamp | D | 0 | Set by the core when a record changes; never earlier than created_at. |
| 10 | quality_flags | string_list | D | 32x60 | Diagnostic codes. They never change authority or approval. |
| 11 | id | id | H | 0 | `ctx_` plus lowercase UUIDv4 hex; immutable. |
| 12 | schema | schema | H | 0 | `context-<kind>/v2`. |
| 13 | state | state | H | 0 | `current` or `history`; must match the directory. |
| 14 | authorization_source | authorization | H | 0 | `user` or `policy`. `legacy` only for migrated records. |
| 15 | retired_at | timestamp | C | 0 | Required for history records. |
| 16 | lifecycle_reason | reason | C | 0 | Required for history records; allowed values are per kind. |
| 17 | section_delimiter | delimiter | D | 40 | Present only when a section is framed. |

## 4. Kinds

`update`: `content` allows replacing sections; `supplement` allows filling an
empty optional section or extending one (the new text starts with the old text);
`metadata` allows no section change. `slot`: see section 6. `filename`: `dated`
is `YYYY-MM-DD-title.md`, `plain` is `title.md`.

| kind | schema | authority | key | slot | update | filename | retire | summary |
|---|---|---|---|---|---|---|---|---|
| snapshot | context-snapshot/v2 | staging | none | none | content | dated | superseded | Session handoff staging. |
| observation | context-observation/v2 | evidence | none | none | supplement | dated | superseded,invalidated | Non-authoritative findings and evidence. |
| decision | context-decision/v2 | authoritative | required | decision-overlap | supplement | dated | superseded,withdrawn | Decisions, rationale, rejected alternatives and current validity. |
| intent | context-intent/v2 | authoritative | required | exact-scope-key | supplement | dated | superseded | Desired project directions that can guide later decisions. |
| document | context-document/v2 | authoritative | required | exact-scope-key | content | plain | superseded | Project-scoped living documents with stable slots. |
| assumption | context-assumption/v2 | provisional | none | none | supplement | dated | superseded,confirmed,refuted | Working assumptions with confirmation and refutation conditions. |
| term | context-term/v2 | definitional | derived | term-overlap | supplement | plain | superseded,deprecated | Project-specific terms and their definitions. |
| archive | context-archive/v2 | evidence | none | none | metadata | dated | superseded | Immutable source material adopted as evidence. |

## 5. Kind headers

| kind | key | type | class | limit | rule |
|---|---|---|---|---|---|
| snapshot | anchors | id_list | S | 12 | Records this memo is anchored to. |
| observation | verified_at | timestamp | S | 0 | Last verification time. |
| observation | kind_hint | enum:decision | S | 0 | A decision-like fallback that may later be imported as a decision. |
| decision | revisit_on | date | S | 0 | Date to reassess. |
| assumption | assumption_status | enum:unverified,confirmed,refuted | D | 0 | `unverified` while current. |
| term | term | string | H | 120 | The term; the key is derived from it. |
| term | aliases | string_list | S | 12x120 | Other names for the same term. |
| term | deprecated_terms | string_list | S | 12x120 | Names that must not be used. |
| term | project_signal | enum:project-specific,project-special-meaning | S | 0 | Missing value adds `project_signal_missing`. |
| archive | original_format | string | S | 80 | Media type or format label of the original. |
| archive | content_digest | digest | D | 0 | SHA-256 of the exact Content bytes. |

## 6. Sections

`field` is the body input name. `list` inputs may be given as a string array and
render as `- item` lines. `flag` is the quality flag added when the section is
empty. The first section of each kind is its primary meaning and is required.

| kind | order | section | alias | field | required | list | flag |
|---|---|---|---|---|---|---|---|
| snapshot | 1 | Current context | 현재 맥락 | current_context | yes | no | - |
| snapshot | 2 | Open items | 열린 항목 | open_items | no | yes | - |
| snapshot | 3 | Next steps | 다음 단계 | next_steps | no | yes | - |
| snapshot | 4 | Decided | 정해진 것 | decided | no | yes | - |
| snapshot | 5 | References | 참조 | references | no | yes | - |
| snapshot | 6 | Capture candidates | capture 후보 | capture_candidates | no | yes | - |
| observation | 1 | Observation | 관찰 | observation | yes | no | - |
| observation | 2 | Evidence | 근거 | evidence | no | yes | evidence_missing |
| observation | 3 | Impact | 영향 | impact | no | no | - |
| observation | 4 | Current handling | 현재 처리 | current_handling | no | no | - |
| observation | 5 | Follow-up conditions | 후속 조건 | followup_conditions | no | yes | - |
| decision | 1 | Decision | 결정 | decision | yes | no | - |
| decision | 2 | Rationale | 취지 | rationale | no | no | rationale_missing |
| decision | 3 | Rejected alternatives | 반려대안 | rejected_alternatives | no | yes | alternatives_missing |
| decision | 4 | Evidence and constraints | 근거와 제약 | constraints | no | yes | evidence_missing |
| decision | 5 | Trade-offs | 트레이드오프 | tradeoffs | no | yes | - |
| decision | 6 | Revisit conditions | 재평가 조건 | revisit_when | no | yes | - |
| intent | 1 | Intent | 의도 | intent | yes | no | - |
| intent | 2 | Success criteria | 성공 기준 | success_criteria | no | yes | success_criteria_missing |
| intent | 3 | Constraints | 제약 | constraints | no | yes | - |
| intent | 4 | Revisit conditions | 재검토 조건 | revisit_conditions | no | yes | - |
| document | 1 | Content | 내용 | content | yes | no | - |
| assumption | 1 | Assumption | 가정 | assumption | yes | no | - |
| assumption | 2 | Basis | 근거 | basis | no | yes | evidence_missing |
| assumption | 3 | Confirmation conditions | 확정 조건 | confirm_conditions | no | yes | - |
| assumption | 4 | Refutation conditions | 반증 조건 | refute_conditions | no | yes | - |
| term | 1 | Definition | 정의 | definition | yes | no | - |
| archive | 1 | Content | 원문 | content | yes | no | - |

ARCHIVE without a `source` entry in Sources gets `source_missing`. A migrated
record gets `authorization_unverified`; a migrated record that had no scope gets
`legacy_scope_defaulted` with scope `global`.

## 7. Limits

| name | value | rule |
|---|---|---|
| body_bytes | 262144 | UTF-8 bytes of all sections except Sources. Larger input returns `needs_archive`. |
| archive_bytes | 524288 | UTF-8 bytes of ARCHIVE Content. |
| header_bytes | 16384 | Header block including delimiters. |
| custom_header_keys | 32 | Host headers per record. |
| custom_header_bytes | 8192 | Sum of host header lines. |
| custom_value_bytes | 512 | One host header string. |
| custom_list_items | 16 | One host header list. |
| source_entries | 100 | Sources lines per record. |
| source_ref_codepoints | 500 | One ref. |
| source_note_codepoints | 500 | One note. |
| filename_bytes | 180 | UTF-8 bytes of a record basename. |
| list_default | 50 | Rows per list page. |
| list_max | 100 | Maximum rows per list page. |
| list_page_bytes | 262144 | Maximum list page bytes. |
| read_default_bytes | 32768 | Section bytes per read or compare page. |
| read_max_bytes | 262144 | Maximum section bytes per page. |
| header_scan_default | 100 | Files per header search request. |
| header_scan_max | 500 | Maximum files per header search request. |
| request_bytes | 2097152 | One write request. |
| transaction_bytes | 8388608 | One frozen prepared transaction. |
| regex_bytes | 256 | Header search pattern. |

## 8. Slots and lifecycle

- `decision-overlap`: two Current decisions with the same key and the same scope
  never coexist. Overlapping scopes (one is an ancestor of the other) coexist only
  when the caller's semantic review judged them `separate` in the prepared write.
- `exact-scope-key`: INTENT and DOCUMENT are unique per exact scope and key.
- `term-overlap`: Current terms in overlapping scopes must not share a canonical
  key among term, aliases and deprecated terms.
- Other kinds have no slot; many records coexist.
- Changes in meaning to DEC, INTENT, TERM, OBS, and ASSUMPTION records use `supersede`. SNAP
  and DOCUMENT change content with `update`. Moving scope or key is always an
  explicit `supersede` that retires the predecessor and checks both slots.
  ARCHIVE content never changes; a scope move keeps its bytes.
- History records have `retired_at` and `lifecycle_reason`. `superseded` requires
  a `superseded-by` source; the successor lists `supersedes`. Both edges must be
  reciprocal and acyclic. Broken edges, duplicate IDs, wrong state and unsafe
  paths are hard errors; missing optional sections are quality flags.

## 9. Files and indexes

- Records live in `context/<kind>/`; history in `context/<kind>/retired/`.
  Dated names use the UTC date of `created_at`. Titles become NFC slugs with path
  characters and whitespace replaced by `-`; Unicode is kept. Collisions, compared
  after NFKC case folding, get `-2`, `-3`, and so on. IDs are never part of the name. A title
  change does not rename a file.
- The area index `context/<kind>/<kind>.index.md` is a projection regenerated by
  the core. Each record appears in exactly one row:

  ```md
  - [Title](2026-09-26-title.md) · Summary · id=ctx_…; kind=decision; state=current; scope=howse/context; key=evidence-optional; created=2026-09-26T06:05:03+00:00; updated=; keywords=clerk,evidence
  ```

  In the title label `\`, `[` and `]` are escaped with `\`. In the summary `\` and
  `·` are escaped. In tail values `\`, `·`, `;`, `=` and `,` are escaped. The path
  is relative to the index and percent-encodes `%`, space, `(` and `)`. Empty
  optional values stay empty. Opt-in header projections listed in
  `.whyve/index-projections.json` append `; header.<namespace.name>=value`.
- The root index lists areas for people. Descriptors and their digests live in
  `.whyve/owners/registry.json` of the vault.
