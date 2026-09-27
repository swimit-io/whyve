---
name: context
description: 새 대화 delta를 한 번 audit하고 답을 바꿀 맥락만 recall하며 성숙한 후보를 알맞은 kind로 보낸다.
---

실행 요건: Node.js 20.20.0 이상. 이 패키지의 `.mjs` 진입점을 실행하고 `/loaded/whyve/skills/...`는 이 파일의 실제 경로에서 풀어 쓴다. Python, 전역 설치, `--help`, plugin script 읽기는 하지 않는다.

# Context

설정, 승인 모드, 쓰기 절차는 [기록 정책](references/recording-policy.md)을 따른다. 사용자에게 보이는 글은 active language로, machine field는 English로 쓰고([active language](references/active-language.md)) 기록 본문의 원래 언어는 보존한다.

각 사용자 turn의 새 의미를 한 번만 audit한다. durable signal이 없으면 context 호출도, audit 표시나 기록 질문도 없다. 동작이나 계약을 바꾸지 않는 기계적 편집이면 guidance 탐색을 건너뛰고 `context/`는 건드리지 않는다. 경로가 주어지면 그 경로만, 아니면 작업 subtree 하나를 정해 한 번만 찾는다. `.`, `--hidden`, 저장소 전체 glob, 루트는 쓰지 않으며 범위를 넓히는 대신 경로를 묻는다. 세션에는 scope/anchor, 이미 읽은 본문의 ID와 `contentDigest`, 보류·거절된 후보 참조만 둔다.

1. 이전 맥락이 답을 바꿀 수 있을 때만 recall한다. 사용자의 선택은 신호지만 요청을 실행하는 것 자체는 신호가 아니다. 메타데이터 `list` → 고른 행 `read` → 행동이 바뀔 때만 언급 → 답이 꼭 필요할 때만 질문 순으로 올린다.

   ```bash
   node /loaded/whyve/skills/context/scripts/context_cli.mjs list --scope pkg/storage --scope-match overlap --limit 20
   node /loaded/whyve/skills/context/scripts/context_cli.mjs read '<id>'
   ```

   `list`는 순위 검색이 아니라 정확한 필터(kind, state, scope match, key, keyword, `--text` 부분 문자열, 날짜, header)다. `coverage.complete`와 `nextCursor`를 확인하고, 빈 결과를 부재의 증거로 삼지 않는다. `read`는 실제 section과 이력의 `doNotFollow`를 돌려준다.
2. 의미는 실제 본문, scope, 취지로 판단한다. ID, digest, 메타데이터는 의미의 근거가 아니다. 충돌이나 바뀐 이유는 결론보다 먼저 알리고 영향받는 행동을 멈춘다. 유지하면 수행하지 않고, 교체는 그 명시적 선택 뒤에만 진행한다. 재평가 조건 충족은 재평가 권한이지 구현 권한이 아니다. 그 선택이 기록 내용을 확정하므로 따로 저장 여부를 묻지 않는다.
3. 원래 요청을 먼저 끝내고 성숙한 맥락은 milestone마다 한 번 제안한다. 의미에 따라 보낸다: 사용자 선택 → decision, 바라는 방향 → intent, 확인된 사실·교훈 → observation, 검증 안 된 전제 → assumption, 프로젝트 용어 → term, 살아 있는 현재 상태 문서 → document, 재개 상태 → snapshot, 불변 원문 → archive. 활성화된 kind만 자동으로 참여한다.
4. 쓰기는 core만 한다. 고정된 preview, 설정, slot, lifecycle, index, 파일 digest(CAS), lock, 원자적 쓰기를 확인한 뒤에만 쓴다.

조회, compare, prepare, 거부된 apply는 기록 파일을 바꾸지 않는다.
