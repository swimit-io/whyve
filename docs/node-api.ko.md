# TypeScript 코어와 CLI 사용

Whyve 0.3.0은 `context-common/v3` 기록 규약을 다루는 TypeScript 코어를 제공합니다.
`@whyve/context` 패키지 하나에 코어, 컴파일된 CLI, 타입 선언, agent 진입점이 들어 있습니다.
Node.js **20.20.0 이상**이 필요하며 런타임 의존성, native addon, Python, Electron, Git,
plugin 설치, 네트워크가 필요하지 않습니다. 기록 형식의 기준은
[docs/record-model.md](record-model.md)이고 `whyve schema [KIND]`가 JSON으로 출력합니다.

## 로컬 패키지 설치

```sh
# Whyve 저장소에서 패키지 생성 (개발 의존성은 여기서만 필요)
npm ci
npm test
npm pack --pack-destination /path/to/packages

# 독립 소비자에서 실제 tarball 설치
npm install /path/to/packages/whyve-context-0.3.0.tgz
npx --no-install whyve init --vault /path/to/existing/vault --features decision,intent,document
npx --no-install whyve list --vault /path/to/existing/vault --kind decision
```

같은 tarball로 전역 CLI 설치도 됩니다. 이 문서는 npm 공개 배포를 뜻하지 않습니다.
plugin checkout에는 컴파일된 `plugins/whyve/dist/`가 들어 있고 `.mjs` 스크립트가 같은 CLI를 씁니다.

## Host API

```ts
import { createWhyve } from '@whyve/context';
import type { RecordInput } from '@whyve/context';

const whyve = createWhyve({ vault: '/path/to/vault', project: '/path/to/project' });
// 사용자가 프로젝트 설정을 고르거나 바꿀 때만 실행한다.
await whyve.initialize({ features: ['decision'], approvalMode: 'explicit' });

const record: RecordInput = {
  kind: 'decision', title: '기록을 로컬 파일로 저장', scope: 'app/storage', key: 'storage-backend',
  body: { decision: '기록을 로컬 Markdown 파일로 저장한다.', rationale: '앱이 오프라인에서도 동작해야 한다.' },
  headers: { 'howse.thread': 'thread/0ba5' },
};
let result = await whyve.prepare({ mutation: { action: 'capture', record }, authorization: { source: 'user', references: ['msg/d385'] } });
if (result.status === 'needs_review') {
  // 기존 기록은 호출자의 모델이 실제 본문을 보고 판단한다.
  const page = await whyve.compare({ record });
  const judgments = page.items.filter(i => i.mandatory).map(i => ({ id: i.row.fields.id, judgment: 'separate' as const, reason: '본문을 보니 다른 질문이다.' }));
  result = await whyve.prepare({ mutation: { action: 'capture', record }, authorization: { source: 'user' }, comparison: page.receipt, semanticReview: { judgments } });
}
if (result.status === 'prepared') {
  const receipt = await whyve.apply(result.handle);   // { status: 'applied', recordId, changedPaths, qualityFlags, … }
  const page = await whyve.list({ kinds: ['decision'], scope: { value: 'app', match: 'overlap' } });
  console.log(page.items.map(row => row.fields.title), (await whyve.read(receipt.recordId)).sections.Decision);
}
```

[실행 가능한 예제](../examples/consumer.cjs)는 이 흐름을 끝까지 실행하고 빈 `PATH`로 같은 vault를
CLI에서 다시 읽습니다.

라이브러리 호출자는 `vault`와 필요하면 `project`를 넘깁니다(`project`는 `.whyve/config.json`을
고르며, `project`만 주면 설정된 vault를 씁니다). 코어는 `process.cwd()`나 환경 변수를 바꾸지 않습니다.
디렉터리는 이미 있어야 하고 호출한 OS 사용자가 쓸 수 있어야 합니다. 읽기도 vault lock을 잡아 중단된
transaction을 보지 않습니다. 한 사용자의 프로세스끼리 조율하는 규약이며 다중 사용자 접근 서비스가 아닙니다.

| Method | 계약 |
|---|---|
| `capabilities()` | 버전, protocol, kind, 한도, regex subset, method 목록. |
| `status()` | vault 형식(`context-common/v3`, `context-common/v2`, `uninitialized`), `writable`, 모드, 활성·등록 kind, index digest. |
| `list(options)` | 정확한 필터로 index 행을 돌려줌: `kinds`, `state`, `scope {value, match}`, `key`, `keywords`, `ids`, `textContains`(제목·요약 부분 문자열), `created`/`updated` 범위, `headers`, `order`, `limit`(≤ 100), `cursor`. 결과는 `items`, `coverage`, `nextCursor`. 순위와 본문 읽기는 없음. |
| `searchHeaders(options)` | header block만 읽음. 조건 `eq`, `contains`, `regex`(RE2 계열 subset, `i` flag), `select`로 값 반환. 한 번에 최대 500개 파일. |
| `read(id, {sections?, maxBytes?, cursor?, raw?})` | 실제 section, source, header, quality flag, `authority`, `doNotFollow`, `lifecycle`, `contentDigest`. 큰 본문은 `nextCursor`로 이어 읽고 `complete`로 완결 여부를 확인. |
| `checkSlot(record, options?)` | prepare와 apply가 쓰는 같은 규칙으로 slot 점유를 미리 확인. |
| `compare({record, action?, targetId?, expand?})` | 필수 비교 집합(supersede 대상, slot 점유 기록, typed 참조)을 완전한 본문과 함께, 선택 확장과 읽은 내용을 묶는 `receipt`까지 돌려줌. |
| `validateReadReceipt(receipt)` | 비교한 파일이 그대로인지 확인. |
| `prepare({mutation, authorization, comparison?, semanticReview?})` | 검증·렌더링 후 preview를 고정: `prepared`, `needs_approval`, `needs_review`, `needs_archive`. |
| `prepare({preparedHandle, authorization})` | `needs_approval` preview를 새 승인으로 완성. 고정된 mutation을 다시 계획할 뿐 새 의미로 다시 만들지 않음. |
| `apply(handle)` | vault lock 아래에서 설정, registry, runtime, 파일 digest를 다시 확인하고 기록과 index를 journal transaction 하나로 씀. 반복하면 `already_applied`. |
| `initialize`, `settings`, `refresh(fix?)`, `recoverRuntime`, `adoptLegacy` | 설정, 설정 조회, 무결성 확인과 index 재생성, 비정상 종료 복구, 이전 runtime 인계. |

mutation은 `capture`, `update`, `supersede`, `retire`, `discard`, `rename`입니다.
`expectedDigest`에는 `read`나 `compare`의 `contentDigest`를 넣습니다. 빠진 선택 section(취지,
근거, 대안 등)은 `qualityFlags`로 돌려줄 뿐 쓰기를 거부하지 않습니다. 본문이 256 KiB를 넘으면
`needs_archive`와 ARCHIVE chunk 제안이 나옵니다.

## 프로젝트 설정

프로젝트 설정의 기준은 `.whyve/config.json`이며, 생성되는 `AGENTS.md`/`CLAUDE.md` 지침과
기록 index와는 따로 둡니다. 여러 프로젝트가 vault 하나를 공유해도 기능 선택과 승인 모드는
프로젝트마다 다릅니다. `$whyve:init`을 다시 실행하면 생략한 설정은 그대로 두고, 기존 프로젝트는
명시적 승인을 유지한 채 등록된 기능을 가져옵니다.

## 의미 판단

코어는 점수나 hash로 의미를 추론하지 않습니다. capture나 supersede에 필수 비교 기록이 있으면
`prepare`가 `needs_review`를 돌려줍니다. 호출자는 `compare`를 실행하고, 모델이 전달된 본문을 보고
각 필수 기록을 `same | separate | support | conflict | replace | unclear`로 판단한 뒤 receipt와 판단을
넣어 다시 prepare합니다. supersede 대상은 `replace`(또는 `same`), 나머지 필수 기록은 `separate`나
`support`여야 합니다. receipt가 읽은 파일과 index는 준비된 쓰기의 전제 조건이 되므로 그 사이 바뀌면
`stale_reference`가 됩니다. 필수 기록이 없으면 비교 없이 씁니다.

## 승인

모든 쓰기에는 `{source:'user', references?, meaning?}` 또는
`{source:'policy', decision:'record'|'ask', reason}`이 필요합니다. 사용자 승인은 모든 모드에서
받습니다. `explicit` 모드(또는 설정 없음)에서 정책 승인은 `needs_approval`이 되고, `auto`와
`adaptive`는 설정된 vault에 대해 `decision:'record'`를 받으며 `ask`는 `needs_approval`이 됩니다.
`prepare({preparedHandle, authorization:{source:'user'}})`로 완성합니다. 승인은 호출자가 보증하는
값이며 인증 서비스가 아닙니다.

## CLI

모든 명령은 JSON envelope 하나(`{"ok":true,"result":…}` 또는 `{"ok":false,"error":…}`)를
출력합니다. 종료 코드는 0 성공, 2 사용법·schema, 3 없음, 5 충돌·승인, 6 무결성, 1 예상하지 못한
오류입니다. `whyve KIND COMMAND …`는 `list`/`search-headers`를 한 kind로 좁히고,
`whyve KIND init`은 그 기능을 켭니다.

```sh
whyve list --kind decision --scope app --scope-match overlap --key storage-backend
whyve read ctx_… --section Decision
whyve compare --input compare.json            # {record, action?, targetId?, expand?}
whyve prepare --input write.json --approved --reference msg/d385 --apply
whyve prepare --input write.json --policy-decision record --policy-reason '확인된 테스트 결과'
whyve prepare --input handle.json --approved --apply   # {"preparedHandle":"prep_…"}
whyve refresh --fix
```

## 오류와 복구

라이브러리 오류는 `code`, `details`, `exitCode`, `envelope()`를 가진 `WhyveError`입니다. 자주 보는
code: `digest_conflict`(읽은 뒤 기록이 바뀜), `stale_reference`/`stale_input`, `project_policy_changed`,
`feature_disabled`, `approval_required`, `migration_required`(v2 vault), `cursor_invalid`/`cursor_stale`.
쓰던 프로세스가 죽으면 `recoverRuntime()`/`whyve runtime recover`가 PID 종료를 확인하고 journal을
되돌립니다. Electron에서는 main process, utility process, Node worker에서 라이브러리를 쓰고 쓰기
가능한 vault는 읽기 전용 ASAR 밖에 둡니다.
