---
name: init
description: 설치된 Whyve plugin을 프로젝트에 맞게 설정하거나 다시 설정하며, 의미 기능과 기록 승인 모드를 고른다.
---

실행 요건: Node.js 20.20.0 이상. 이 패키지의 `.mjs` 진입점을 실행하고 `/loaded/whyve/skills/...`는 이 파일의 실제 경로에서 풀어 쓴다. Python, 전역 설치, `--help`는 쓰지 않는다.

# Whyve init

init은 이미 설치된 코드를 설정할 뿐 plugin을 설치하거나 제거하지 않는다. 프로젝트 기능(`decision`, `assumption`, `term`, `intent`, `document`)과 기록 모드 `explicit|auto|adaptive`를 고른다. 평소에는 adaptive를 권하되, 사용자의 선택 없이 자동 기록으로 바꾸지 않는다. 생략한 옵션은 현재 설정을 유지하며 새 vault의 기본값은 `decision`과 `explicit`이다. SNAP, OBS, ARCHIVE는 기본 제공된다.

```bash
node /loaded/whyve/skills/init/scripts/whyve_init.mjs --host codex
node /loaded/whyve/skills/init/scripts/whyve_init.mjs --host claude-code --features decision,intent,document --approval-mode adaptive
```

기능 하나만 더하고 나머지는 유지하려면 해당 wrapper를 쓴다. 예: `node /loaded/whyve/skills/init/scripts/intent_init.mjs`.

- 설정은 프로젝트의 `.whyve/config.json`에 저장된다. `--host`는 관리 guidance block을 `AGENTS.md`(codex) 또는 `CLAUDE.md`(claude-code)에 쓰며 marker 밖 내용은 건드리지 않는다. 다른 프로젝트는 `--project DIR`, 기존 공유 vault는 `--vault DIR`로 지정한다. vault를 함께 써도 설정은 프로젝트마다 따로다.
- `--features ''`는 기본 제공 기능만 고른다. 다시 실행하면 빠진 영역만 추가하고 데이터는 지우지 않는다. 기능을 끄면 새 쓰기와 자동 참여가 멈추며 기존 기록은 계속 읽을 수 있다.
- init은 내용 migration이 아니다. `context-common/v2` vault는 읽기는 되지만 영역 추가나 쓰기에는 명시적 형식 migration(`whyve migrate-project PATH --to-format context-common/v3`, MIGRATION 참고)이 필요하다. 사용자가 요청하지 않으면 대신 실행하지 않는다.
- 오류가 나면 `code`와 message를 알리고 원인을 고친 뒤 같은 init을 다시 실행한다. 끝난 단계는 반복해도 같은 결과다.

설정 안내와 오류 설명은 active language로 쓰고([active language](../context/references/active-language.md)) 명령, 옵션, 코드, 파일 이름은 English로 둔다. 모드의 의미는 [기록 정책](../context/references/recording-policy.md)에 있다.
