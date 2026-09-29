---
name: context
description: Check each new user turn once for context worth recalling or saving; recall only what could change the answer, and route ready items to the right record type.
---

Runtime: Node.js 20.20.0+. Run the `.mjs` entrypoints of this package; resolve `/loaded/whyve/skills/...` from this file's own path. Don't use Python, a global install, or `--help`, and don't read plugin scripts.

# Context

Follow the [recording policy](references/recording-policy.md) for settings, approval modes and the write flow. Use the active language for user text and English for machine fields ([active language](references/active-language.md)); preserve artifact prose.

Audit each user turn's new meaning once. No durable signal means zero context calls and no audit status or capture question. For a mechanical local edit that changes no behavior or contract, skip guidance discovery and leave `context/` alone: use the named path, or infer one task subtree and search it once. Never use `.`, `--hidden`, repository-wide globs or the root; ask for the path instead of widening. Keep only scope/anchor, IDs and `contentDigest`s of bodies already read, and pending/dismissed references in a session-only ledger.

1. Recall only when prior context can change the answer. A user choice is a signal; executing a request is not. Escalate step by step: metadata `list`, then `read` of selected rows, then mention it only if the action changes, then a question only if an answer is required.

   ```bash
   node /loaded/whyve/skills/context/scripts/context_cli.mjs list --scope pkg/storage --scope-match overlap --limit 20
   node /loaded/whyve/skills/context/scripts/context_cli.mjs read '<id>'
   ```

   `list` is exact filtering (kinds, state, scope match, key, keywords, `--text` substring, dates, headers), not ranked search. Check `coverage.complete` and `nextCursor`; an empty page is not proof of absence. `read` returns actual sections and `doNotFollow` for history.
2. Judge meaning from actual bodies, scope and rationale; IDs, digests and metadata are not semantic evidence. Report a conflict or changed reason before the conclusion and hold the affected action: "keep" means the action is not performed; "supersede" goes ahead only after the user explicitly chooses it. A satisfied revisit condition permits reassessment, not implementation. The user's choice settles what is recorded; ask no separate storage question.
3. Finish the primary request first, then propose mature context once per milestone. Route by meaning: user choice → decision, desired direction → intent, verified fact or lesson → observation, unverified premise → assumption, project term → term, living current-state text → document, resume state → snapshot, immutable source → archive. Only enabled kinds participate automatically.
4. Only the core writes, after checking the frozen preview, settings, slots, lifecycle, indexes, file digests (CAS), lock and atomic write.

Discovery, compare, prepare and a refused apply change no record bytes.
