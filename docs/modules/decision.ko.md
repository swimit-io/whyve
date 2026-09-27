# Whyve — decision

[English](./decision.md)

scope와 key를 가진 권위 있는 사용자 선택이다. section은 `Decision`(필수), `Rationale`, `Rejected alternatives`, `Evidence and constraints`, `Trade-offs`, `Revisit conditions`이며 빈 선택 section은 quality flag가 된다. slot `decision-overlap`: scope와 key마다 Current DEC는 하나이고, 같은 key의 겹치는 scope는 `separate`로 판단됐을 때만 공존한다. 호출자는 hash가 아니라 실제 본문을 비교한다. supersede는 이전 기록에 대한 `replace` 판단이 필요하며 이전 기록은 `doNotFollow` 이력으로 남는다. 재평가 조건은 재평가 권한이지 구현 권한이 아니다. 한국어 heading `결정`, `취지`, `반려대안`도 별칭으로 받는다.

Whyve 0.3.0에 포함된 내부 모듈이며 별도 플러그인이 아니다. 설치·설정은 [시작 안내](../../README.ko.md)와 단일 `$whyve:init` 진입점을 사용한다. SNAP·OBS·ARCHIVE는 기본 제공하며 나머지 kind는 프로젝트에서 선택한다.

모든 기록은 [공통 기록 정책](../../plugins/whyve/skills/context/references/recording-policy.md)의 `explicit|auto|adaptive`를 따른다. 사용자 또는 정책 승인으로 `prepare`하고, 기존 기록 검토가 필요하면 `compare`와 호출자의 판단을 거친 뒤 `apply`한다. 기록 자동화는 호출자의 의미 판단이나 사용자 결정을 대신하지 않는다. 기능을 꺼도 데이터는 보존되며 명시적 이력 조회는 가능하다.

기록은 `context-common/v3` 아래 `context-decision/v2`를 쓴다. 형식의 기준은 [record-model.md](../record-model.md)다. 상세 필드와 lifecycle은 [프로토콜](../../plugins/whyve/skills/decision/references/decision-protocol.ko.md)을 따른다.
