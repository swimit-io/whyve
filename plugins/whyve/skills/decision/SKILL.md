---
name: decision
description: When the user makes or questions a choice, recall current decisions, report conflicts, and record only the user's explicit choices (new, replaced, or withdrawn).
---

Runtime: Node.js 20.20.0+. Run the `.mjs` entrypoints of this package; resolve `/loaded/whyve/skills/...` from this file's own path. Don't use Python, a global install, or `--help`, and don't read plugin scripts.

# Decision

A DEC is the user's explicit choice that governs current or future action, within a scope. Ideas, questions, facts, preferences and unaccepted proposals are not DECs (facts → observation, premises → assumption, direction → intent). Follow the [recording policy](../context/references/recording-policy.md) for settings, approval modes and statuses; this file adds the DEC rules. In `auto`/`adaptive` a DEC still needs a genuine user choice; policy authorization is not commitment evidence. Use the active language for user text and English for machine fields; keep artifact prose as the user wrote it.

Record fields: `scope` and `key` are required; one Current DEC per scope+key, and the same key in an ancestor or descendant scope coexists only when judged `separate`. Body: `decision` (required), `rationale`, `rejected_alternatives`, `constraints`, `tradeoffs`, `revisit_when` (list sections take string arrays); optional header `revisit_on` (date). Missing optional sections become quality flags (`rationale_missing`, `alternatives_missing`, `evidence_missing`); never invent content to clear them.

## Recall and judge

1. Act only on a choice signal: the user states, questions or changes a choice. Executing a compatible request needs no lookup. Reuse bodies already read in this response while nothing was written.
2. Find rows by metadata, then read the bodies you need:

   ```bash
   node /loaded/whyve/skills/decision/scripts/decision_cli.mjs list --scope pkg/storage --scope-match overlap
   node /loaded/whyve/skills/decision/scripts/decision_cli.mjs read '<id>'
   ```

   `list` filters exactly (`--key`, `--keyword`, `--text` substring of title or summary) and does not rank; check `coverage.complete` and `nextCursor`. An empty page is not proof of absence and does not justify a vault-wide rerun. If the scope is unknown, ask. For the same choice reuse the returned `scope` and `key`; never mint an alias key.
3. Compare the actual `Decision`, `Rationale`, `Rejected alternatives` and non-empty `Revisit conditions`. Proceed silently when compatible.
4. On a conflict or changed reason, before the main answer quote those sections and quote the revisit condition and label it with exactly one of `satisfied`, `no evidence`, or `ambiguous`. `satisfied` needs present facts that establish the stored condition; the requested action itself is not evidence. Hold the affected action (no code, file or command change that advances it) and ask one binary question: keep (the action is not performed) or supersede (proceed only after that explicit choice). A satisfied condition permits reassessment, not implementation. The explicit choice settles the payload and authorizes recording without a second storage question.
5. Finish the primary request, then propose mature choices once per milestone; do not re-propose dismissed or deferred ones without new evidence.

History rows are `doNotFollow: true`; `read` shows `lifecycle.successor`. Never follow history as the active choice.

## Capture

```bash
cat > /tmp/whyve-dec-capture.json <<'EOF'
{
  "mutation": {
    "action": "capture",
    "record": {
      "kind": "decision",
      "title": "Store records as local files",
      "scope": "pkg/storage",
      "key": "storage-backend",
      "body": {
        "decision": "Store records as local Markdown files.",
        "rationale": "The consumer must work offline.",
        "rejected_alternatives": ["Hosted storage: requires a network."],
        "revisit_when": ["Offline use is no longer required."]
      }
    }
  }
}
EOF
node /loaded/whyve/skills/decision/scripts/decision_cli.mjs prepare --input /tmp/whyve-dec-capture.json --approved --apply
```

A receipt with `status: "applied"` confirms the write; do not re-read. `needs_review` means a Current DEC already holds this or an overlapping scope with the same key: compare and judge it (a different choice for the same slot is a supersede).

## Supersede

After the user has explicitly chosen the new option, compare the successor with the predecessor:

```bash
cat > /tmp/whyve-dec-compare.json <<'EOF'
{
  "action": "supersede",
  "targetId": "<current-id>",
  "record": {
    "kind": "decision",
    "title": "Store records in SQLite",
    "scope": "pkg/storage",
    "key": "storage-backend",
    "body": {
      "decision": "Store records in a local SQLite database.",
      "rationale": "Queries across records became too slow with files.",
      "rejected_alternatives": ["Local Markdown files: too slow to query."]
    }
  }
}
EOF
node /loaded/whyve/skills/decision/scripts/decision_cli.mjs compare --input /tmp/whyve-dec-compare.json
```

Judge every ID in `result.receipt.mandatory` from its `sections`: the predecessor must be `replace` (or `same`); others must be `separate` or `support`, otherwise stop and ask. If `coverage.complete` is false, continue with `--cursor` first. Then prepare with the predecessor's `contentDigest`, the receipt copied verbatim and the judgments:

```bash
cat > /tmp/whyve-dec-supersede.json <<'EOF'
{
  "mutation": {
    "action": "supersede",
    "id": "<current-id>",
    "expectedDigest": "<current-contentDigest>",
    "reason": "The user chose SQLite for faster queries.",
    "successor": {
      "kind": "decision",
      "title": "Store records in SQLite",
      "scope": "pkg/storage",
      "key": "storage-backend",
      "body": {
        "decision": "Store records in a local SQLite database.",
        "rationale": "Queries across records became too slow with files.",
        "rejected_alternatives": ["Local Markdown files: too slow to query."]
      }
    }
  },
  "comparison": <result.receipt>,
  "semanticReview": {
    "judgments": [
      { "id": "<current-id>", "judgment": "replace", "reason": "Same storage choice; the user picked a different backend." }
    ]
  }
}
EOF
node /loaded/whyve/skills/decision/scripts/decision_cli.mjs prepare --input /tmp/whyve-dec-supersede.json --approved --apply
```

Without `comparison` and `semanticReview` the result is `needs_review` and nothing is written. The predecessor moves to `retired/` as history; the successor lists `supersedes`.

## Withdraw

To end a choice without a successor (a `note` is required):

```bash
cat > /tmp/whyve-dec-retire.json <<'EOF'
{ "mutation": { "action": "retire", "id": "<current-id>", "expectedDigest": "<current-contentDigest>", "reason": "withdrawn", "note": "The user dropped the storage requirement." } }
EOF
node /loaded/whyve/skills/decision/scripts/decision_cli.mjs prepare --input /tmp/whyve-dec-retire.json --approved --apply
```

In `auto`/`adaptive`, when the user clearly made the choice but did not ask to record it, use `--policy-decision record --policy-reason '<why>'` instead of `--approved`. Details: [decision protocol](references/decision-protocol.md).
