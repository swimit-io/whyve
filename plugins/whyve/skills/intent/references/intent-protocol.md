# Intent protocol (`context-intent/v2`)

Authority: `authoritative`. Directory `context/intent/`, file
`YYYY-MM-DD-title.md`, history in `retired/`.

| part | field | rule |
|---|---|---|
| header | `scope`, `key` | Required, canonical. Slot `exact-scope-key`: one Current INTENT per exact scope and key. |
| `## Intent` | `intent` | Required. The desired direction. |
| `## Success criteria` | `success_criteria` | Optional list; empty adds `success_criteria_missing`. |
| `## Constraints` | `constraints` | Optional list. |
| `## Revisit conditions` | `revisit_conditions` | Optional list. |

Korean aliases: `의도`, `성공 기준`, `제약`, `재검토 조건`.

## Lifecycle

- `update` supplements only.
- `supersede` replaces the direction; the predecessor must be judged `replace`
  or `same` from its actual Intent body. The slot moves to the successor with
  reciprocal `supersedes` / `superseded-by` sources.

INTENT does not require DEC or DOCUMENT. A DEC may use `serves:intent`; INTENT
stores no inverse edge.
