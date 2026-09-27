---
schema: "context-area-index/v1"
index: true
area: "term"
owner: "context-term"
artifact_schema: "context-term/v1"
authority: "authoritative"
summary: "Manage project-specific terms and their canonical definitions."
search_terms: ["term","terminology","definition"]
projection_fields: ["scope","term_key","term"]
---

<!-- BEGIN CONTEXT GENERATED:owner-profile -->
{"artifact_schema":"context-term/v1","authority":"authoritative","kind":"term","owner":"context-term","schema":"context-owner-descriptor/v2","structural_profile":{"fields":{"aliases":{"max_item_chars":120,"max_items":12,"min_items":0,"required":false,"type":"string_list"},"deprecated_terms":{"max_item_chars":120,"max_items":12,"min_items":0,"required":false,"type":"string_list"},"deprecation_reason":{"max_chars":800,"min_chars":1,"required":false,"type":"string"},"related":{"max_item_chars":120,"max_items":12,"min_items":0,"required":false,"type":"string_list"},"replacement_term":{"max_chars":120,"min_chars":1,"required":false,"type":"string"},"retired_at":{"required":false,"type":"timestamp"},"retired_reason":{"required":false,"type":"enum","values":["deprecated","superseded"]},"scope":{"max_chars":160,"min_chars":1,"required":true,"type":"string"},"superseded_by":{"required":false,"type":"context_id"},"supersedes":{"max_items":12,"min_items":0,"required":false,"type":"context_id_list"},"term":{"max_chars":120,"min_chars":1,"required":true,"type":"string"},"term_key":{"max_chars":80,"min_chars":1,"required":true,"type":"string"}},"index_projection":["scope","term_key","term"],"lifecycle":{"allowed_topologies":["create_current","replace_same_state","retire_current","supersede_current"],"reasons":{"deprecated":{"forbidden_fields":["superseded_by"],"references":[],"required_fields":["retired_at","retired_reason","deprecation_reason"],"successor":"forbidden","topology":"retire_current"},"superseded":{"forbidden_fields":["deprecation_reason","replacement_term"],"references":[{"field":"superseded_by","location":"predecessor","match":"equals","target":"successor"},{"field":"supersedes","location":"successor","match":"contains","target":"predecessor"}],"required_fields":["retired_at","retired_reason","superseded_by"],"successor":"required","topology":"supersede_current"}}},"schema":"context-structural-profile/v1","sections":{"ordered":["정의"],"primary":"정의","required":["정의"]}}}
<!-- END CONTEXT GENERATED:owner-profile -->

# Term

## Current
<!-- BEGIN CONTEXT GENERATED:current -->
- [[context/term/term-기록]] — term 기록 — term 검증 <!-- context-entry {"id":"ctx_ccfe9a1f854148b3bacfd345e7d2ee5d","path":"context/term/term-기록.md","title":"term 기록","summary":"term 검증","state":"current","created_at":"2026-09-26T11:00:04+00:00","terms":[],"scope":"consumer","term_key":"vault","term":"Vault"} -->
<!-- END CONTEXT GENERATED:current -->

## History
<!-- BEGIN CONTEXT GENERATED:history -->
<!-- END CONTEXT GENERATED:history -->
