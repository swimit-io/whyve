# Whyve — assumption

[English](./assumption.md)

검증되지 않은 프로젝트 전제와 그 근거, 확정·반증 조건이다. section은 `Assumption`(필수), `Basis`(비면 `evidence_missing`), `Confirmation conditions`, `Refutation conditions`이며 `assumption_status`는 core가 정한다. `evidence` source와 함께 `retire`로 확정·반증한다. 기록 승인이 사실 검증을 대신하지 않는다.

Whyve 0.3.0에 포함된 내부 모듈이며 별도 플러그인이 아니다. 설치·설정은 [시작 안내](../../README.ko.md)와 단일 `$whyve:init` 진입점을 사용한다. SNAP·OBS·ARCHIVE는 기본 제공하며 나머지 kind는 프로젝트에서 선택한다.

모든 기록은 [공통 기록 정책](../../plugins/whyve/skills/context/references/recording-policy.md)의 `explicit|auto|adaptive`를 따른다. 사용자 또는 정책 승인으로 `prepare`하고, 기존 기록 검토가 필요하면 `compare`와 호출자의 판단을 거친 뒤 `apply`한다. 기록 자동화는 호출자의 의미 판단이나 사용자 결정을 대신하지 않는다. 기능을 꺼도 데이터는 보존되며 명시적 이력 조회는 가능하다.

기록은 `context-common/v3` 아래 `context-assumption/v2`를 쓴다. 형식의 기준은 [record-model.md](../record-model.md)다. 상세 필드와 lifecycle은 [프로토콜](../../plugins/whyve/skills/assumption/references/assumption-protocol.md)을 따른다.
