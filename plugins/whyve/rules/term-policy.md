---
description: Apply the project terminology boundary and keep all persistence in the Whyve core.
alwaysApply: true
---

- Record only a term with an explicit project-specific or project-special meaning. Decline generic dictionary meanings.
- Route observed facts to OBS, committed choices to DEC and unverified premises to ASM.
- Canonical keys of term, aliases and deprecated terms must not intersect across Current TERMs in overlapping scopes, nor within one record.
- `supersede` requires a `replace` judgment made from both actual term and Definition bodies. IDs, digests and index metadata are not semantic evidence.
- `retire` as `deprecated` requires a note; a replacement term uses a different canonical key. `update` only supplements.
- Look a term up only after actually encountering an ambiguous or project-specific term, never for every word.
- Follow the active-language contract for user-facing text; keep machine fields English and preserve artifact prose.
- Follow the shared [recording policy](../skills/context/references/recording-policy.md): `explicit` uses user semantic approval, `auto` uses project policy, and `adaptive` requires a record/ask assessment. Only enabled kinds participate automatically. The core is the only writer: `prepare` with authorization, `compare` and judgments when it returns `needs_review`, then `apply` of the unchanged handle in the same response. Never rebuild authorized meaning.
