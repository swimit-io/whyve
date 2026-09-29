---
name: document
description: Save or replace a living project document (for example, a checklist or design notes) under a stable scope and key.
---

Runtime: Node.js 20.20.0+. Run the `.mjs` entrypoints of this package; resolve `/loaded/whyve/skills/...` from this file's own path. Don't use Python, a global install, or `--help`, and don't read plugin scripts.

# Document

DOCUMENT (`authority: authoritative`) is current-state text that agents or people consume through recall, in one slot per exact `(scope, key)`. Follow the [recording policy](../context/references/recording-policy.md) for settings, approval and statuses. Use the active language for user text and English for machine fields; keep user-authored prose.

- Record substantive current-state `content` (Markdown). Decline external deliverables (they stay repository files), evidence, premises, desired direction and chosen commitments; route those to their kinds.
- One Current DOCUMENT per exact scope and key; a capture into an occupied slot returns `needs_review`. Change content with `update` (replaces `content`, keeps ID, path, slot and state). Moving scope or key is a `supersede`.
- Keep each slot small enough to read in one pass. Split a large design into stable chapter slots such as `design-skeleton`, `design-envelope`, `design-rules` instead of enlarging one slot. The body limit is 256 KiB.
- File name is `title.md`. Don't add taxonomies, subtypes, or inverse links. A DEC may point here with an `affects:document` source; review the newer DEC and update Content only when the current state has actually changed.

A direct, explicit, unconditional user statement that settles the content, scope and lifecycle effect is approval; ask only about unresolved meaning, never a second storage question.

```bash
cat > /tmp/whyve-doc.json <<'EOF'
{
  "mutation": {
    "action": "capture",
    "record": {
      "kind": "document",
      "title": "Release checklist",
      "scope": "pkg/release",
      "key": "release-checklist",
      "body": { "content": "1. npm run build\n2. npm test\n3. npm run test:package" }
    }
  }
}
EOF
node /loaded/whyve/skills/document/scripts/document_cli.mjs prepare --input /tmp/whyve-doc.json --approved --apply

cat > /tmp/whyve-doc-update.json <<'EOF'
{
  "mutation": {
    "action": "update",
    "id": "<document-id>",
    "expectedDigest": "<document-contentDigest>",
    "patch": { "body": { "content": "1. npm run build\n2. npm test\n3. npm run test:package\n4. Tag the release" } }
  }
}
EOF
node /loaded/whyve/skills/document/scripts/document_cli.mjs prepare --input /tmp/whyve-doc-update.json --approved --apply
```

Find the slot with `document_cli.mjs list --scope <scope> --key <key>` and `read` it for the `contentDigest`. Details: [document protocol](references/document-protocol.md).
