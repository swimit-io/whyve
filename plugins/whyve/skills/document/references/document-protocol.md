# Document protocol (`context-document/v2`)

Authority: `authoritative`. Directory `context/document/`, file `title.md`,
history in `retired/`.

| part | field | rule |
|---|---|---|
| header | `scope`, `key` | Required, canonical. Slot `exact-scope-key`: one Current DOCUMENT per exact scope and key. |
| `## Content` | `content` | Required. Current-state Markdown; alias `내용`. |

DOCUMENT is a current-state statement consumed by agents or people through
recall. External deliverables remain repository files. Each slot is one read
budget; expand larger knowledge through stable chapter slots.

## Lifecycle

- `update` replaces `content` under the same ID, path, slot and state and sets
  `updated_at`.
- `supersede` only moves the record to another scope or key; it checks both
  slots.
- A DEC may use `affects:document`; DOCUMENT stores no inverse edge.

Only the core writes; a capture into an occupied slot returns `needs_review`,
and apply re-checks the slot under the lock.
