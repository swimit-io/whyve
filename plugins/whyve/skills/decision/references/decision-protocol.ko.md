# Decision 프로토콜 (`context-decision/v2`)

권위: `authoritative`. 디렉터리 `context/decision/`, 파일 이름 `YYYY-MM-DD-title.md`,
이력은 `retired/`에 둔다.

| 위치 | 필드 | 규칙 |
|---|---|---|
| header | `scope`, `key` | 필수, 정규형(NFKC, 대소문자 접기, 그 밖의 문자열은 `-`. scope는 8단계·160자 이하, key는 80자 이하이며 `/` 금지). |
| header | `revisit_on` | 선택. 재평가 날짜. |
| `## Decision` | `decision` | 필수. 선택 자체. |
| `## Rationale` | `rationale` | 선택. 비면 `rationale_missing`. |
| `## Rejected alternatives` | `rejected_alternatives` | 선택 목록. 비면 `alternatives_missing`. |
| `## Evidence and constraints` | `constraints` | 선택 목록. 비면 `evidence_missing`. |
| `## Trade-offs` | `tradeoffs` | 선택 목록. |
| `## Revisit conditions` | `revisit_when` | 선택 목록. |

한국어 heading `결정`, `취지`, `반려대안`, `근거와 제약`, `트레이드오프`, `재평가 조건`도
별칭으로 받는다. 한 파일에서는 한 가지 방식만 쓴다.

## 기록 대상

DEC는 범위가 정해진, 현재나 이후 행동을 이끄는 사용자의 명시적 선택이다. 아이디어, 질문,
사실, 선호, 받아들여지지 않은 제안은 DEC가 아니다. 승인 모드가 사용자 선택을 대신하지 않는다.

## Slot (`decision-overlap`)

scope와 key가 같은 Current DEC 두 개는 공존할 수 없다. 상위·하위 scope의 같은 key는 준비된
쓰기에 그 기록에 대한 `separate`(또는 `support`) 판단이 있을 때만 공존한다.
`check-slot --input FILE`(`{"record": …}`)로 미리 점유 상태를 볼 수 있으며, prepare와 apply는
어느 경우든 규칙을 강제한다.

## 비교

`compare`는 필수 집합을 완전한 본문과 함께 돌려준다. supersede 대상, 같은 slot과 겹치는
scope의 점유 기록, typed source(`serves:intent`, `informed_by:observation` 등)로 참조한 기록이다.
`expand`(`sameScope`, `crossKindKey`, `ids`)는 선택 맥락을 더하며 판단이 필요 없다. 호출자는 각 필수
기록을 실제 Decision, Rationale, Rejected alternatives, Revisit conditions로 보고 `same`,
`separate`, `support`, `conflict`, `replace`, `unclear` 중 하나로 판단한다. 점수, digest,
메타데이터는 의미를 정하지 않는다.

## Lifecycle

- `capture`: 새 Current 기록.
- `update`: 보충만 가능(빈 선택 section 채우기, 기존 text 뒤에 이어 쓰기). 의미가 바뀌면 `supersede`.
- `supersede`: 이전 기록은 `replace` 또는 `same`으로 판단돼야 한다. 이전 기록은 `superseded-by`와
  함께 이력이 되고 후속 기록에는 `supersedes`가 남는다. scope나 key를 옮기는 것도 supersede이며
  두 slot을 모두 확인한다.
- `retire`의 `withdrawn`과 `note`: 후속 없이 선택을 거둔다.

이력은 `doNotFollow: true`다. 재평가 조건은 재평가를 허락할 뿐 그 자체로 구현을 허락하지 않는다.

## 선택 관계

typed relation source로 다른 kind를 연결하되 필수로 만들지 않는다: `serves:intent`,
`informed_by:observation`, `informed_by:assumption`, `affects:document`. core는 각 대상이 그
kind로 존재하는지 확인하며 역방향 edge는 저장하지 않는다.
