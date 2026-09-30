# Whyve

AI 에이전트 세션이 바뀌어도 프로젝트 결정의 이유를 이어갑니다. Whyve는 결정, 관찰, 가정, 의도, 용어와 문서를 읽을 수 있는 Markdown으로 기록합니다. 이전 결정의 이유를 다시 찾고, 새 제안을 현재 결정과 비교한 뒤 변경 여부를 판단할 수 있습니다.

## 설치와 시작

Node.js 20.20.0 이상이 필요합니다. Python, Whyve 계정과 원격 Whyve 서비스는 필요하지 않습니다.

```sh
# Claude Code
claude plugin marketplace add https://github.com/swimit-io/whyve.git --scope user
claude plugin install whyve@whyve --scope user

# Codex
codex plugin marketplace add https://github.com/swimit-io/whyve.git
codex plugin add whyve@whyve
```

Codex나 Claude Code를 다시 시작하고 프로젝트에서 `$whyve:init`(Codex) 또는 `/whyve:init`(Claude Code)을 실행하세요. 기록할 종류와 `explicit`, `auto`, `adaptive` 중 기록 방식을 고릅니다. 새 프로젝트의 기본값은 결정과 `explicit`입니다. init은 이미 설치된 플러그인을 설정하며 다른 서비스를 설치하지 않습니다.

## 세 가지 사용 예

1. 이유를 기록합니다. “이번 체험판은 CSV만 지원하고 Excel은 나중에 넣기로 결정했어. 첫 사용 흐름을 빨리 검증하려는 이유야. 이 결정을 기억해줘.”
2. 같은 프로젝트의 새 세션에서 묻습니다. “Excel 지원을 미룬 이유가 뭐였지?”
3. 결정을 바꾸지 않고 비교합니다. “이번 체험판에 Excel도 넣으면 어떨까? 아직 결정 변경은 하지 않았어.”

세 번째 요청에서는 기존 이유와 제안을 비교하되 기존 결정이 유지되어야 합니다. 재현 가능한 기록은 [두 세션 데모](https://github.com/swimit-io/whyve/blob/main/assets/demo/README.md)를 참고하세요.

## 파일, 데이터와 제어

설정은 `.whyve/config.json`에 저장합니다. 기록은 기본적으로 프로젝트의 `context/` 디렉터리에 저장하고, 초기화 때 다른 파일시스템 vault를 명시적으로 선택할 수 있습니다. 기록은 사용자가 삭제하거나 마이그레이션할 때까지 남으며, 기능을 꺼도 기존 파일은 지워지지 않습니다. Git 사용은 선택 사항입니다. Whyve 패키지의 런타임은 로컬 파일을 읽고 쓰며 Whyve 서버로 전송하거나 API 키를 사용하지 않습니다. 다만 에이전트가 기록을 읽거나 대화에 포함하면 AI 호스트가 해당 내용을 처리할 수 있으며, 이때는 호스트의 데이터 정책이 적용됩니다. 비밀 정보는 기록이나 검토용 예제에 넣지 마세요.

기록 방식은 저장 전 확인 시점을 정할 뿐, 다른 코드 변경이나 외부 행동을 승인하지 않습니다. 플러그인과 지원 문의 자료의 처리 방식은 [개인정보 안내](PRIVACY.ko.md), 기록 기준은 [기록 정책](skills/context/references/recording-policy.md), 형식은 [템플릿](templates/)에 있습니다.

## 문의와 라이선스

설정이 안 되면 Node.js 버전을 확인하고 해당 프로젝트에서 init(`$whyve:init` 또는 `/whyve:init`)을 다시 실행하세요. 일반 버그는 [GitHub 이슈](https://github.com/swimit-io/whyve/issues), 보안 문제는 [비공개 보안 신고](https://github.com/swimit-io/whyve/security/advisories/new)로 알려주세요. 라이선스는 [Apache-2.0](https://github.com/swimit-io/whyve/blob/main/LICENSE)입니다.
