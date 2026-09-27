---
schema: "context-area-index/v1"
index: true
area: "intent"
owner: "context-intent"
artifact_schema: "context-intent/v1"
authority: "authoritative"
summary: "Desired project directions that can guide later decisions."
search_terms: ["intent","direction","purpose"]
projection_fields: ["scope","intent_key"]
---

<!-- BEGIN CONTEXT GENERATED:owner-profile -->
{"artifact_schema":"context-intent/v1","authority":"authoritative","kind":"intent","owner":"context-intent","schema":"context-owner-descriptor/v2","structural_profile":{"fields":{"intent_key":{"max_chars":80,"min_chars":1,"required":true,"type":"string"},"retired_at":{"required":false,"type":"timestamp"},"retired_reason":{"required":false,"type":"enum","values":["superseded"]},"scope":{"max_chars":160,"min_chars":1,"required":true,"type":"string"},"superseded_by":{"required":false,"type":"context_id"},"supersedes":{"max_items":12,"min_items":0,"required":false,"type":"context_id_list"}},"index_projection":["scope","intent_key"],"lifecycle":{"allowed_topologies":["create_current","supersede_current"],"reasons":{"superseded":{"forbidden_fields":[],"references":[{"field":"superseded_by","location":"predecessor","match":"equals","target":"successor"},{"field":"supersedes","location":"successor","match":"contains","target":"predecessor"}],"required_fields":["retired_at","retired_reason","superseded_by"],"successor":"required","topology":"supersede_current"}}},"schema":"context-structural-profile/v1","sections":{"ordered":["Intent","Success criteria","Constraints","Revisit conditions"],"primary":"Intent","required":["Intent"]}}}
<!-- END CONTEXT GENERATED:owner-profile -->

# Intent

## Current
<!-- BEGIN CONTEXT GENERATED:current -->
- [[context/intent/맥락-연속성]] — 맥락 연속성 — intent 검증 <!-- context-entry {"id":"ctx_561bb11574164b8095aa6e3a8f0471aa","path":"context/intent/맥락-연속성.md","title":"맥락 연속성","summary":"intent 검증","state":"current","created_at":"2026-09-26T11:00:03+00:00","terms":[],"scope":"consumer","intent_key":"continuity"} -->
<!-- END CONTEXT GENERATED:current -->

## History
<!-- BEGIN CONTEXT GENERATED:history -->
<!-- END CONTEXT GENERATED:history -->
