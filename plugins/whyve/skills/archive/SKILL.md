---
name: archive
description: Store an exact, unchangeable copy of long source material (for example, a contract, an email, or a spec) that backs up a recorded decision or fact.
---

Runtime: Node.js 20.20.0+. Run the `.mjs` entrypoints of this package; resolve `/loaded/whyve/skills/...` from this file's own path. Don't use Python, a global install, or `--help`, and don't read plugin scripts.

# Archive

ARCHIVE (`context-archive/v2`, `authority: evidence`) keeps an immutable original that supports a durable record. It is not a deliverable store and not a substitute for OBS, DEC, INTENT or DOCUMENT. Follow the [recording policy](../context/references/recording-policy.md) for settings, approval and statuses.

- Capture only a source original the user adopted as evidence. An explicit archive request that settles source and scope is approval; ask only about unresolved meaning and never show the rendered file.
- `content` is stored byte for byte (at most 524,288 UTF-8 bytes); the core adds `content_digest`. Add a `source` entry to `sources`; without one the record gets `source_missing`. Pass `original_format` (the media type, such as `text/plain`) inside `body`; it is stored as a header.
- A body over the limit returns `needs_archive` with `chunks`: store each chunk as its own ARCHIVE, citing the same source.
- ARCHIVE never changes: no content update, no supersede except a scope move with identical bytes. `discard` is refused while another record references it.
- Cite it from other records by ID, for example an OBS `evidence` item or a `source` entry `- evidence: ctx_…`. Read it only when the original is actually needed.

```bash
cat > /tmp/whyve-archive.json <<'EOF'
{
  "mutation": {
    "action": "capture",
    "record": {
      "kind": "archive",
      "title": "Vendor storage terms 2026-09-20",
      "scope": "pkg/storage",
      "body": {
        "content": "Section 4. Customer data must stay on customer devices.\nSection 5. No hosted replicas.",
        "original_format": "text/plain"
      },
      "sources": [{ "relation": "source", "ref": "mail:vendor-2026-09-20" }]
    }
  }
}
EOF
node /loaded/whyve/skills/context/scripts/context_cli.mjs prepare --input /tmp/whyve-archive.json --approved --apply
```

Use the active language for user text and English for machine fields.
