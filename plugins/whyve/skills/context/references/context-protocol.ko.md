# Vault 프로토콜 (`context-common/v3`)

패키지에 포함된 core(Node.js 20.20.0 이상)만 vault를 읽고 씁니다.
`whyve schema [KIND]`가 kind, header, section, 한도를 기계가 읽는 형태로 출력합니다.

## 저장 구조

- vault는 `context/`가 있는 일반 디렉터리입니다. Git은 선택 사항입니다.
- 기록은 `context/<kind>/`, 이력은 `context/<kind>/retired/`에 둡니다. 파일 이름은
  `YYYY-MM-DD-title.md`(DOCUMENT와 TERM은 `title.md`)이며, 제목을 바꿔도 파일 이름은
  그대로이고 ID는 파일 이름에 들어가지 않습니다.
- 기록은 `---` 사이의 `key: <compact JSON>` header, kind 순서의 `## Section` 본문,
  마지막 `## Sources`(`- relation: ref` 또는 `- relation: ref — note`)로 이뤄집니다.
  host 메타데이터는 `howse.thread` 같은 namespace header를 쓰며 `whyve.`는 예약되어 있습니다.
- `context/<kind>/<kind>.index.md`는 기록마다 일반 Markdown 한 줄이며 core가 다시 만듭니다.
  `whyve refresh --fix`는 기록에서 index를 재생성합니다.

| kind | 권위 | key와 slot | 변경 |
|---|---|---|---|
| snapshot | staging | 없음 | `update`로 내용 교체, `discard` |
| observation | evidence | 없음 | 보충, `supersede`, `retire invalidated`, `discard` |
| decision | authoritative | 필수. scope+key당 Current 하나, 겹치는 scope는 `separate` 판정 필요 | 보충, `supersede`, `retire withdrawn` |
| intent | authoritative | 필수. 정확한 scope+key마다 하나 | 보충, `supersede` |
| document | authoritative | 필수. 정확한 scope+key마다 하나 | `update`로 내용 교체 |
| assumption | provisional | 없음 | 보충, `supersede`, `retire confirmed|refuted` |
| term | definitional | `term`에서 파생. 겹치는 scope에서 term·alias·deprecated term이 겹치면 안 됨 | 보충, `supersede`, `retire deprecated` |
| archive | evidence | 없음 | 불변, `discard`만 가능 |

보충(supplement)은 비어 있는 선택 section을 채우거나 기존 text 뒤에 이어 쓰는 update입니다.
의미가 바뀌면 `supersede`를 쓰며, 이전 기록은 서로를 가리키는 `supersedes`/`superseded-by`
source와 함께 이력으로 이동합니다. 이력 기록은 `doNotFollow: true`입니다.

## 조회

- `list`: index 메타데이터만 읽는 정확한 필터이며 순위를 매기지 않습니다. `--kind`,
  `--state current|history|all`, `--scope S --scope-match exact|ancestor|descendant|overlap`,
  `--key`, `--keyword`(반복, `--keyword-match all|any`), `--id`, `--text`(제목·요약의 부분 문자열),
  `--created-from/--created-to`, `--updated-from/--updated-to`, header 조건 `--header KEY=VALUE`,
  `--header-contains`, `--header-regex`, `--order recent`, `--limit`(기본 50, 최대 100), `--cursor`.
  `coverage`는 조회한 kind와 조회하지 않은 kind, page 완결 여부를 알려줍니다. 빈 결과는 그 필터에
  맞는 행이 없다는 뜻일 뿐입니다.
- `search-headers`: header block만 읽습니다(`--select howse.*`로 값 반환). 한 번에 최대 500개 파일입니다.
- `read ID [--section NAME]... [--max-bytes N] [--cursor C] [--raw]`: 실제 section, source,
  quality flag, lifecycle, `contentDigest`를 돌려줍니다. 부분 page는 `complete: false`이므로
  판단 전에 `nextCursor`로 이어 읽습니다.
- kind wrapper(`decision_cli.mjs list …`)는 `list`를 해당 kind로 좁힙니다.

## 쓰기

[기록 정책](recording-policy.md)을 따릅니다. 사용자 또는 정책 승인으로 `prepare`(필요하면 먼저
`compare`) 뒤 `apply`합니다. preview는 vault 안에 고정되고(7일 보관), apply는 vault lock 아래에서
모든 파일 digest, 프로젝트 설정, registry를 다시 확인한 뒤 journal을 거쳐 원자적으로 쓰며 반복해도
같은 결과입니다. `runtime recover`는 쓰던 프로세스가 끝났음을 확인한 뒤 중단된 journal을 복구합니다.

## 출력과 종료 코드

stdout에는 JSON envelope 하나만 나옵니다. 종료 코드는 0 성공, 2 사용법·schema, 3 없음,
5 충돌·승인, 6 무결성, 1 예상하지 못한 오류입니다. `context-common/v2` vault는 읽을 수 있지만
쓰려면 `whyve migrate-project PATH --to-format context-common/v3`가 필요합니다(MIGRATION 참고).
