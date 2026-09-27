# Decision protocol (`context-decision/v2`)

Authority: `authoritative`. Directory `context/decision/`, file
`YYYY-MM-DD-title.md`, history in `retired/`.

| part | field | rule |
|---|---|---|
| header | `scope`, `key` | Required, canonical (NFKC, case-folded, `-` for other runs; scope ≤ 8 segments, 160 chars; key ≤ 80, no `/`). |
| header | `revisit_on` | Optional date to reassess. |
| `## Decision` | `decision` | Required. The choice itself. |
| `## Rationale` | `rationale` | Optional; empty adds `rationale_missing`. |
| `## Rejected alternatives` | `rejected_alternatives` | Optional list; empty adds `alternatives_missing`. |
| `## Evidence and constraints` | `constraints` | Optional list; empty adds `evidence_missing`. |
| `## Trade-offs` | `tradeoffs` | Optional list. |
| `## Revisit conditions` | `revisit_when` | Optional list. |

Korean headings `결정`, `취지`, `반려대안`, `근거와 제약`, `트레이드오프`,
`재평가 조건` are accepted aliases; one file uses one style.

## Claim boundary

A DEC is a user's explicit choice governing current or future action, with an
identified scope. Ideas, questions, facts, preferences and unaccepted proposals
are not DECs. The authorization mode never substitutes for the user's choice.

## Slot (`decision-overlap`)

Two Current DECs with the same scope and key never coexist. The same key in an
ancestor or descendant scope coexists only when the prepared write carries a
`separate` (or `support`) judgment for it. `check-slot --input FILE`
(`{"record": …}`) reports occupants in advance; prepare and apply enforce the
rule regardless.

## Comparison

`compare` returns the mandatory set with complete bodies: the supersede target,
exact-slot and overlapping-scope occupants, and records referenced by typed
sources (`serves:intent`, `informed_by:observation`, …). `expand` adds
optional context (`sameScope`, `crossKindKey`, `ids`); optional items never
need a judgment. The caller judges each mandatory record `same`, `separate`,
`support`, `conflict`, `replace` or `unclear` from its actual Decision,
Rationale, Rejected alternatives and Revisit conditions. Scores, digests and
metadata never establish meaning.

## Lifecycle

- `capture`: new Current record.
- `update`: supplements only (fill an empty optional section or extend one);
  changed meaning uses `supersede`.
- `supersede`: the predecessor must be judged `replace` or `same`; it moves to
  history with `superseded-by`, the successor gets `supersedes`. Changing scope
  or key is also a supersede and checks both slots.
- `retire` with `withdrawn` and a `note`: ends a choice without successor.

History is `doNotFollow: true`. A revisit condition permits reassessment, never
implementation by itself.

## Optional relations

Sources with typed relations link other kinds without making them required:
`serves:intent`, `informed_by:observation`, `informed_by:assumption`,
`affects:document`. The core validates that each typed target exists with that
kind and stores no inverse edge.
