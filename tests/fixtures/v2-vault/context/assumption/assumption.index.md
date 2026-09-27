---
schema: "context-area-index/v1"
index: true
area: "assumption"
owner: "context-assumption"
artifact_schema: "context-assumption/v1"
authority: "provisional"
summary: "Manage unverified project-scoped premises and their validation conditions."
search_terms: ["assumption","premise","validation"]
projection_fields: ["scope"]
---

<!-- BEGIN CONTEXT GENERATED:owner-profile -->
{"artifact_schema":"context-assumption/v1","authority":"provisional","kind":"assumption","owner":"context-assumption","schema":"context-owner-descriptor/v2","structural_profile":{"fields":{"evidence_refs":{"max_item_chars":500,"max_items":12,"min_items":0,"required":false,"type":"string_list"},"impacted_decisions":{"max_items":12,"min_items":0,"required":false,"type":"context_id_list"},"refutation_reason":{"max_chars":800,"min_chars":1,"required":false,"type":"string"},"retired_at":{"required":false,"type":"timestamp"},"retired_reason":{"required":false,"type":"enum","values":["confirmed","refuted","superseded"]},"scope":{"max_chars":160,"min_chars":1,"required":true,"type":"string"},"superseded_by":{"required":false,"type":"context_id"},"supersedes":{"max_items":12,"min_items":0,"required":false,"type":"context_id_list"}},"index_projection":["scope"],"lifecycle":{"allowed_topologies":["create_current","replace_same_state","retire_current","supersede_current"],"reasons":{"confirmed":{"forbidden_fields":["superseded_by","refutation_reason"],"references":[],"required_fields":["retired_at","retired_reason","evidence_refs"],"successor":"forbidden","topology":"retire_current"},"refuted":{"forbidden_fields":["superseded_by"],"references":[],"required_fields":["retired_at","retired_reason","evidence_refs","refutation_reason","impacted_decisions"],"successor":"forbidden","topology":"retire_current"},"superseded":{"forbidden_fields":["evidence_refs","refutation_reason"],"references":[{"field":"superseded_by","location":"predecessor","match":"equals","target":"successor"},{"field":"supersedes","location":"successor","match":"contains","target":"predecessor"}],"required_fields":["retired_at","retired_reason","superseded_by"],"successor":"required","topology":"supersede_current"}}},"schema":"context-structural-profile/v1","sections":{"ordered":["가정","근거","확정 조건","반증 조건"],"primary":"가정","required":["가정","근거"]}}}
<!-- END CONTEXT GENERATED:owner-profile -->

# Assumption

## Current
<!-- BEGIN CONTEXT GENERATED:current -->
- [[context/assumption/assumption-기록]] — assumption 기록 — assumption 검증 <!-- context-entry {"id":"ctx_b3841d245d324b4dba1fe6fea3f6ef1d","path":"context/assumption/assumption-기록.md","title":"assumption 기록","summary":"assumption 검증","state":"current","created_at":"2026-09-26T11:00:04+00:00","terms":[],"scope":"consumer"} -->
<!-- END CONTEXT GENERATED:current -->

## History
<!-- BEGIN CONTEXT GENERATED:history -->
<!-- END CONTEXT GENERATED:history -->
