# Term protocol (`context-term/v2`)

Authority: `definitional`. Directory `context/term/`, file `title.md`, history
in `retired/`.

| part | field | rule |
|---|---|---|
| header | `scope` | Required, canonical. |
| header | `term` | Required, ≤ 120 characters; the `key` is derived from it (NFKC, case-folded, runs of other characters become `-`). |
| header | `aliases`, `deprecated_terms` | Optional, at most 12 items of ≤ 120 characters. |
| header | `project_signal` | `project-specific` or `project-special-meaning`; missing adds `project_signal_missing`. |
| `## Definition` | `definition` | Required; alias `정의`. |

## Claim boundary

Only a term with an explicit project-specific or project-special meaning. Observed
facts belong to OBS, accepted choices to DEC, unverified premises to ASM. Generic
dictionary definitions are not recorded.

## Slot (`term-overlap`)

For Current TERMs in exact, ancestor or descendant scopes, the canonical keys of
`{term, aliases, deprecated_terms}` must not intersect, and they must not overlap
within one record.

## Lifecycle

- `update` supplements only; it cannot change the term's meaning.
- `supersede` requires a `replace` (or `same`) judgment made from both actual
  term and Definition bodies.
- `retire` with `deprecated` requires a `note`; a replacement term must use a
  different canonical key.

Look terms up only after an actual encounter with an ambiguous or
project-specific term.
