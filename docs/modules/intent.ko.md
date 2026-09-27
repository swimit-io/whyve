# Whyve — intent

[English](./intent.md)

오래 유지할 바라는 방향과 성공 기준이며 선택한 구현이나 추론한 사용자 약속이 아니다. section은 `Intent`(필수), `Success criteria`(비면 `success_criteria_missing`), `Constraints`, `Revisit conditions`다. slot `exact-scope-key`: 정확한 scope와 key마다 Current INTENT는 하나다. intent는 독립적으로 의미가 있으며 decision은 `serves:intent` source로 선택적으로 연결할 수 있고 역방향 edge는 없다.

Whyve 0.3.0에 포함된 내부 모듈이며 별도 플러그인이 아니다. 설치·설정은 [시작 안내](../../README.ko.md)와 단일 `$whyve:init` 진입점을 사용한다. SNAP·OBS·ARCHIVE는 기본 제공하며 나머지 kind는 프로젝트에서 선택한다.

모든 기록은 [공통 기록 정책](../../plugins/whyve/skills/context/references/recording-policy.md)의 `explicit|auto|adaptive`를 따른다. 사용자 또는 정책 승인으로 `prepare`하고, 기존 기록 검토가 필요하면 `compare`와 호출자의 판단을 거친 뒤 `apply`한다. 기록 자동화는 호출자의 의미 판단이나 사용자 결정을 대신하지 않는다. 기능을 꺼도 데이터는 보존되며 명시적 이력 조회는 가능하다.

기록은 `context-common/v3` 아래 `context-intent/v2`를 쓴다. 형식의 기준은 [record-model.md](../record-model.md)다. 상세 필드와 lifecycle은 [프로토콜](../../plugins/whyve/skills/intent/references/intent-protocol.md)을 따른다.
