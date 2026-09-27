# Whyve — core

[English](./core.md)

저장, index, 필터와 page, 구조적 비교, lifecycle 검증, lock을 맡는 유일한 물리적 writer다. 기본 제공 SNAP은 끝나지 않은 작업을 이어가게 하고(`update`로 내용 교체), OBS는 다시 쓸 근거를 보존하며(근거는 선택이고 없으면 `evidence_missing` flag), ARCHIVE는 `content_digest`와 함께 불변 원문을 보존한다. 조회는 정확한 `list` 필터와 `searchHeaders`이며 어휘 순위 검색은 없다. observation이나 snapshot에서 DEC 권위를 추론하지 않는다.

Whyve 0.3.0에 포함된 내부 모듈이며 별도 플러그인이 아니다. 설치·설정은 [시작 안내](../../README.ko.md)와 단일 `$whyve:init` 진입점을 사용한다. SNAP·OBS·ARCHIVE는 기본 제공하며 나머지 kind는 프로젝트에서 선택한다.

모든 기록은 [공통 기록 정책](../../plugins/whyve/skills/context/references/recording-policy.md)의 `explicit|auto|adaptive`를 따른다. 사용자 또는 정책 승인으로 `prepare`하고, 기존 기록 검토가 필요하면 `compare`와 호출자의 판단을 거친 뒤 `apply`한다. 기록 자동화는 호출자의 의미 판단이나 사용자 결정을 대신하지 않는다. 기능을 꺼도 데이터는 보존되며 명시적 이력 조회는 가능하다.

기록은 `context-common/v3` 아래 `context-snapshot/v2`, `context-observation/v2`, `context-archive/v2`를 쓴다. 형식의 기준은 [record-model.md](../record-model.md)다. 상세 필드와 lifecycle은 [프로토콜](../../plugins/whyve/skills/context/references/context-protocol.ko.md)을 따른다.
