# Assumption protocol (`context-assumption/v2`)

Authority: `provisional`. Directory `context/assumption/`, file
`YYYY-MM-DD-title.md`, history in `retired/`. No key and no slot.

| part | field | rule |
|---|---|---|
| header | `scope` | Required, canonical. |
| header | `assumption_status` | Derived: `unverified` while Current, `confirmed` or `refuted` in history. |
| `## Assumption` | `assumption` | Required. The unverified premise. |
| `## Basis` | `basis` | Optional list; empty adds `evidence_missing`. |
| `## Confirmation conditions` | `confirm_conditions` | Optional list. |
| `## Refutation conditions` | `refute_conditions` | Optional list. |

Korean aliases: `가정`, `근거`, `확정 조건`, `반증 조건`.

## Claim boundary

Record only a premise that is explicitly unverified. Observed facts and evidence
belong to OBS, accepted choices to DEC. Questions, ideas, hopes and preferences
alone are not assumptions.

## Lifecycle

- `update` supplements only.
- `supersede` replaces a changed premise; the predecessor must be judged
  `replace` or `same` from its actual Assumption body.
- `retire` with `confirmed` or `refuted` requires at least one `evidence`
  source. A refutation should cite affected decisions with `impacts:decision`;
  it never edits a DEC. Deciding what to do about those decisions is a separate
  user choice.

Recall only when the premise can change the current answer.
