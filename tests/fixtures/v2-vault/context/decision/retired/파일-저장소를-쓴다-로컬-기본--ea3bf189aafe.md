---
schema: "context-decision/v1"
id: "ctx_ea3bf189aafe490ebec19d808a27c382"
title: "파일 저장소를 쓴다 — \"로컬\" [기본]"
summary: "decision 검증"
created_at: "2026-09-26T11:00:03+00:00"
captured_from: "manual"
source_refs: ["test:source"]
tags: ["storage","로컬"]
search_terms: ["파일","file;store"]
scope: "consumer"
decision_key: "storage"
revisit_when: ["네트워크가 필수가 되면"]
relations: {"serves:intent":["ctx_561bb11574164b8095aa6e3a8f0471aa"]}
superseded_by: "ctx_5da41fea9be24469b0202e8c64b1ec96"
retired_at: "2026-09-26T11:00:04+00:00"
retired_reason: "superseded"
---

## Decision

파일 저장소를 사용한다.

## Rationale

오프라인 실행이 필요하다.

## Rejected alternatives

- 서버 의존성

## Revisit conditions

- 네트워크가 필수가 되면
