<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/github/readme-logo-light.svg">
    <img alt="Whyve" src="assets/github/readme-logo-dark.svg" width="240">
  </picture>
</p>

<p align="center"><strong>Keep the thread.</strong> 작업의 맥락을 이어갑니다.</p>

<p align="center">
AI 코딩 에이전트를 위한 오래가는 프로젝트 컨텍스트. 결정과 그 이유를 세션이 바뀌어도 이어 줍니다.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue"></a>
  <a href="https://github.com/swimit-io/whyve/actions/workflows/test.yml"><img alt="Tests" src="https://github.com/swimit-io/whyve/actions/workflows/test.yml/badge.svg"></a>
  <img alt="Node.js 20.20 or newer" src="https://img.shields.io/badge/node-%3E%3D20.20-informational">
</p>

<p align="center"><a href="README.md">English</a></p>

## 빠른 설치

Whyve는 Codex와 Claude Code에 설치하는 플러그인입니다. Node.js 20.20.0 이상이 필요합니다.

```bash
# Codex
codex plugin marketplace add https://github.com/swimit-io/whyve.git
codex plugin add whyve@whyve

# Claude Code
claude plugin marketplace add https://github.com/swimit-io/whyve.git --scope user
claude plugin install whyve@whyve --scope user
```

설치한 뒤 호스트를 다시 불러오고 프로젝트에서 `$whyve:init`을 실행하세요.

<!-- DEMO -->
<p align="center">
  <img alt="Claude Code 두 세션: 결정을 기록하고, 새 세션이 그 이유를 꺼내고, 같은 세션의 다음 요청이 새 제안을 기존 결정과 비교한다" src="assets/demo/two-sessions.gif" width="720">
</p>
<p align="center"><sub>두 세션, 세 번의 요청, 하나의 결정. 아래 예제를 Claude Code로 실제 실행한 기록을 transcript에서 재생했습니다(영문). <a href="assets/demo/README.md">녹화 방법</a>.</sub></p>

## memory 플러그인이 아닙니다

claude-mem은 무슨 일이 있었는지를 기억합니다. Whyve는 왜 그렇게 정했는지를 지킵니다.

claude-mem이나 Claude Code 내장 auto memory 같은 도구는 세션에서 일어난 일을 담습니다. Whyve가 남기는 것은 그보다 좁습니다. 내린 결정, 그 결정을 받치는 전제·용어·의도, 그렇게 정한 이유, 그리고 무엇이 무엇을 대체했는지입니다. 나중 세션이 결정을 뒤집자고 하면 Whyve는 기록된 결정과 이유를 그 제안 옆에 꺼내 놓습니다. 사람이 정하기 전에는 아무것도 바뀌지 않습니다.

둘은 함께 씁니다. Whyve가 memory 도구를 대신하지 않습니다.

## 무엇을 해 주나요

새 세션은 앞 세션에서 왜 그렇게 정했는지 모른 채 시작합니다. Whyve가 그 이유를 이어 줍니다.

- **결정과 이유가 세션이 끝나도 남습니다.** 다음 주에 "이거 왜 이렇게 정했지?"라고 물어도 에이전트가 기록을 보고 답합니다.
- **방향을 바꿀 때 원래 이유부터 봅니다.** 누군가 결정을 되돌리자고 하면, 무엇이든 바꾸기 전에 그때의 이유가 먼저 나옵니다.
- **모든 기록은 직접 열어 볼 수 있는 파일입니다.** 기록은 프로젝트의 `context/` 폴더에 Markdown 파일로 남습니다. Git은 써도 되고 안 써도 됩니다. 서버, 데이터베이스, API 키가 필요 없습니다.

## 기록은 이렇게 생겼습니다

기록 하나는 프로젝트 `context/` 폴더 안의 Markdown 파일 하나입니다. 결정 기록은 이렇게 읽힙니다.

```md
## Decision

체험판은 CSV만 지원하고 Excel은 다음으로 미룬다.

## Rationale

첫 사용 흐름을 빨리 검증한다.

## Rejected alternatives

- 체험판에 Excel 포함: 첫 출시가 늦어진다.
```

## 사용법

프로젝트에서 `$whyve:init`을 실행해 무엇을 어떻게 기록할지 고릅니다. init은 이미 설치한 플러그인을 프로젝트에 맞게 설정할 뿐, 새로 설치하지는 않습니다.

| 설정 | 선택 |
|---|---|
| 기록할 것 | Decision, Assumption, Term, Intent, Document |
| 항상 사용 가능 | Observation, Snapshot, Archive |
| 기록 방식 | `explicit`, `auto`, `adaptive` |

처음에는 Decision과 `explicit`으로 시작합니다. init을 다시 실행해 바꿀 수 있고, 기능을 꺼도 이미 있는 기록은 지워지지 않습니다.

세 방식은 Whyve가 언제 물어보는지가 다릅니다.

- **explicit**: 분명한 결정이나 "기억해 줘"만 기록하고, 뜻이나 범위가 애매하면 물어봅니다.
- **auto**: 기록할 만한 것은 매번 묻지 않고 기록합니다.
- **adaptive**: 바로 기록하되, 확인이 필요할 때만 물어봅니다.

`auto`도 대화 전체를 받아 적지는 않습니다. 어떤 방식에서든 제안은 제안으로 남습니다. 모델이 사용자의 결정을 지어내거나 자기 선호를 사용자 결정으로 기록하지 않습니다. 기록 방식을 골랐다고 해서 에이전트가 관계없는 코드를 고치거나 바깥에 무언가를 보내도 된다는 뜻도 아닙니다.

평소처럼 말하면 됩니다. "이 선택을 한 이유가 뭐였지?", "이 결정을 기억해", "어디까지 했는지 저장해". Whyve는 폴더 전체가 아니라 필요한 기록만 읽습니다.

### 두 세션에서 결정 하나 이어 보기

새 프로젝트에서 init을 마쳤다면(Decision + `explicit`), 다음 말을 차례로 해 보세요.

1. 첫 세션에서 결정을 남깁니다.

   > 이 체험판은 CSV만 지원하고 Excel은 다음으로 미루기로 결정했어.
   > 첫 사용 흐름을 빨리 검증하려는 선택이야. 이 결정을 기억해 줘.

2. 같은 프로젝트의 새 세션에서 이유를 물어봅니다.

   > 우리가 Excel 지원을 미룬 이유가 뭐였지?

3. 이어서 바꿔 볼지 검토합니다.

   > Excel도 이번 체험판에 넣는 건 어떨까? 아직 결정 변경은 아니야.

Whyve가 기록을 확인해 주고, 저장된 이유를 꺼내고, 새 아이디어를 기존 결정과 비교하는지 보세요. 마지막 말은 비교만 부탁한 것이라 결정은 그대로 남습니다. `auto`와 `adaptive`에서도 같습니다.

## 어디까지 확인했나요

저장소의 [테스트](https://github.com/swimit-io/whyve/tree/main/tests/node)는 결정과 이유가 기록되는지, 결정을 바꿀 때 이전 이유가 남는지, 현재 기록과 지난 기록을 읽을 수 있는지를 확인합니다. 잘 관리한 Markdown 메모나 ADR보다 낫다는 점은 입증하지 못했고, 토큰이나 비용이 줄어드는지도 재지 않았습니다. 도움이 되는지는 위의 두 세션 예제로 확인하는 것이 가장 빠릅니다.

## Whyve로 만든 제품

[Howse](https://howse-delta.vercel.app/)는 Codex와 Claude Code를 내 Mac에서 한 팀으로 움직이게 하는 앱입니다. Whyve가 들어 있어서 한 에이전트가 정한 결정을 다음 에이전트가 이어받습니다.

*이름의 뜻:* Whyve는 *why*(왜)와 *weave*(엮다)를 합친 이름입니다. 선택의 이유를 한 올로 엮어 세션에서 세션으로 이어 갑니다.

## 로드맵

**Whyve Cloud**: 여러 기기에서 같은 컨텍스트를, Git 없이. 준비하고 있습니다. Whyve 자체는 지금처럼 오픈소스이고 로컬에서 동작합니다.

Whyve는 Apache-2.0 오픈소스이며 한 사람이 만들고 유지합니다. 버그 신고는 [이슈](https://github.com/swimit-io/whyve/issues)로 받고, 풀 리퀘스트는 지금은 받지 않습니다. 보안 문제는 [SECURITY.md](SECURITY.md)를 보세요.

## 개발자용 문서

- Node 라이브러리와 CLI: [docs/node-api.ko.md](docs/node-api.ko.md)
- 기록 형식: [docs/record-model.md](docs/record-model.md) (영문)
- 호환성: [docs/compatibility.md](docs/compatibility.md) (영문)
- 버전별 변경: [CHANGELOG.md](CHANGELOG.md) (영문), 업그레이드: [MIGRATION.md](MIGRATION.md) (영문)
