# Whyve — document

[English](./document.md)

`list`와 `read`로 읽는 살아 있는 현재 상태 문서이며, 정확한 scope와 key마다 `Content` section 하나(slot `exact-scope-key`)를 `title.md`로 저장한다. `update`는 같은 ID와 slot에서 내용을 교체하고, scope나 key를 옮기는 것은 supersede다. 큰 지식은 안정된 chapter slot으로 나눈다. 외부 산출물은 저장소 파일로 둔다.

Whyve 0.3.0에 포함된 내부 모듈이며 별도 플러그인이 아니다. 설치·설정은 [시작 안내](../../README.ko.md)와 단일 `$whyve:init` 진입점을 사용한다. SNAP·OBS·ARCHIVE는 기본 제공하며 나머지 kind는 프로젝트에서 선택한다.

모든 기록은 [공통 기록 정책](../../plugins/whyve/skills/context/references/recording-policy.md)의 `explicit|auto|adaptive`를 따른다. 사용자 또는 정책 승인으로 `prepare`하고, 기존 기록 검토가 필요하면 `compare`와 호출자의 판단을 거친 뒤 `apply`한다. 기록 자동화는 호출자의 의미 판단이나 사용자 결정을 대신하지 않는다. 기능을 꺼도 데이터는 보존되며 명시적 이력 조회는 가능하다.

기록은 `context-common/v3` 아래 `context-document/v2`를 쓴다. 형식의 기준은 [record-model.md](../record-model.md)다. 상세 필드와 lifecycle은 [프로토콜](../../plugins/whyve/skills/document/references/document-protocol.md)을 따른다.
