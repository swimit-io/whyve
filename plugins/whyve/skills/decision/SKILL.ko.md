---
name: decision
description: 사용자 선택 신호가 있을 때 Current DEC 본문을 불러와 충돌을 알리고, 명시적인 사용자 선택만 기록한다(capture, supersede, withdraw).
---

실행 요건: Node.js 20.20.0 이상. 이 패키지의 `.mjs` 진입점을 실행하고 `/loaded/whyve/skills/...`는 이 파일의 실제 경로에서 풀어 쓴다. Python, 전역 설치, `--help`, plugin script 읽기는 하지 않는다.

# Decision

DEC는 현재나 이후의 행동을 이끄는, 범위가 정해진 사용자의 명시적 선택이다. 아이디어, 질문, 사실, 선호, 받아들여지지 않은 제안은 DEC가 아니다(사실 → observation, 전제 → assumption, 방향 → intent). 설정, 승인 모드, 결과 status는 [기록 정책](../context/references/recording-policy.md)을 따르고 이 문서는 DEC 규칙만 더한다. `auto`/`adaptive`에서도 DEC에는 실제 사용자 선택이 있어야 하며 정책 승인은 선택의 근거가 되지 않는다. 사용자에게 보이는 글은 active language, machine field는 English로 쓰고 기록 본문은 사용자가 쓴 말 그대로 둔다.

기록 필드: `scope`와 `key`는 필수다. scope+key마다 Current DEC는 하나이고, 상위·하위 scope의 같은 key는 `separate`로 판정됐을 때만 함께 있을 수 있다. 본문은 `decision`(필수), `rationale`, `rejected_alternatives`, `constraints`, `tradeoffs`, `revisit_when`이며 목록 section은 문자열 배열로 준다. 선택 header로 `revisit_on`(날짜)이 있다. 빠진 선택 section은 quality flag(`rationale_missing`, `alternatives_missing`, `evidence_missing`)가 될 뿐이며, flag를 없애려고 내용을 지어내지 않는다.

## 조회와 판단

1. 선택 신호에만 움직인다. 사용자가 선택을 말하거나 묻거나 바꿀 때다. 기존 결정과 맞는 요청을 실행할 때는 조회하지 않는다. 이번 응답에서 이미 읽은 본문은 그사이 쓰기가 없었다면 다시 쓴다.
2. 메타데이터로 행을 찾고 필요한 본문만 읽는다.

   ```bash
   node /loaded/whyve/skills/decision/scripts/decision_cli.mjs list --scope pkg/storage --scope-match overlap
   node /loaded/whyve/skills/decision/scripts/decision_cli.mjs read '<id>'
   ```

   `list`는 순위 없이 정확히 거른다(`--key`, `--keyword`, 제목·요약 부분 문자열 `--text`). `coverage.complete`와 `nextCursor`를 확인한다. 빈 결과는 부재의 증거가 아니며 vault 전체를 다시 뒤질 이유도 아니다. scope를 모르면 묻는다. 같은 선택이면 돌려받은 `scope`와 `key`를 그대로 쓰고 비슷한 key를 새로 만들지 않는다.
3. 실제 `Decision`, `Rationale`, `Rejected alternatives`, 비어 있지 않은 `Revisit conditions`를 비교한다. 맞으면 조용히 진행한다.
4. 충돌하거나 이유가 바뀌면 본 답변보다 먼저 그 section들을 인용하고, 재평가 조건을 `satisfied`, `no evidence`, `ambiguous` 중 하나로 그대로 적는다. `satisfied`는 저장된 조건을 성립시키는 현재 사실이 있을 때만 쓰며, 요청된 행동 자체는 근거가 아니다. 영향받는 행동은 멈춘다(그 행동을 진행시키는 코드·파일·명령 변경 금지). 그리고 두 선택지를 담은 질문 하나를 한다. 유지(행동을 하지 않음) 또는 교체(그 명시적 선택 뒤에만 진행). 조건 충족은 재평가 권한이지 구현 권한이 아니다. 명시적 선택이 기록 내용을 확정하고 기록도 승인하므로 따로 저장 여부를 묻지 않는다.
5. 원래 요청을 먼저 끝내고, 성숙한 선택은 milestone마다 한 번 제안한다. 거절·보류된 후보는 새 근거 없이 다시 제안하지 않는다.

이력 행은 `doNotFollow: true`이며 `read`의 `lifecycle.successor`로 후속 기록을 알 수 있다. 이력을 현재 선택으로 따르지 않는다.

## Capture

```bash
cat > /tmp/whyve-dec-capture.json <<'EOF'
{
  "mutation": {
    "action": "capture",
    "record": {
      "kind": "decision",
      "title": "기록을 로컬 파일로 저장",
      "scope": "pkg/storage",
      "key": "storage-backend",
      "body": {
        "decision": "기록을 로컬 Markdown 파일로 저장한다.",
        "rationale": "소비자가 오프라인에서도 동작해야 한다.",
        "rejected_alternatives": ["호스팅 저장소: 네트워크가 필요하다."],
        "revisit_when": ["오프라인 사용이 더는 필요 없을 때."]
      }
    }
  }
}
EOF
node /loaded/whyve/skills/decision/scripts/decision_cli.mjs prepare --input /tmp/whyve-dec-capture.json --approved --apply
```

receipt의 `status: "applied"`가 기록 확인이므로 다시 읽지 않는다. `needs_review`는 같은 key의 Current DEC가 이 scope나 겹치는 scope에 이미 있다는 뜻이다. 비교해 판단하며, 같은 slot에 다른 선택이면 supersede다.

## Supersede

사용자가 새 선택지를 명시적으로 고른 뒤, 후속 기록을 이전 기록과 비교한다.

```bash
cat > /tmp/whyve-dec-compare.json <<'EOF'
{
  "action": "supersede",
  "targetId": "<current-id>",
  "record": {
    "kind": "decision",
    "title": "기록을 SQLite에 저장",
    "scope": "pkg/storage",
    "key": "storage-backend",
    "body": {
      "decision": "기록을 로컬 SQLite 데이터베이스에 저장한다.",
      "rationale": "파일로는 기록 간 조회가 너무 느려졌다.",
      "rejected_alternatives": ["로컬 Markdown 파일: 조회가 너무 느리다."]
    }
  }
}
EOF
node /loaded/whyve/skills/decision/scripts/decision_cli.mjs compare --input /tmp/whyve-dec-compare.json
```

`result.receipt.mandatory`의 모든 ID를 `sections`로 판단한다. 이전 기록은 `replace`(또는 `same`)여야 하고, 나머지는 `separate`나 `support`여야 하며 그 밖이면 멈추고 묻는다. `coverage.complete`가 false면 먼저 `--cursor`로 이어 받는다. 그다음 이전 기록의 `contentDigest`, 그대로 복사한 receipt, 판단을 넣어 prepare한다.

```bash
cat > /tmp/whyve-dec-supersede.json <<'EOF'
{
  "mutation": {
    "action": "supersede",
    "id": "<current-id>",
    "expectedDigest": "<current-contentDigest>",
    "reason": "사용자가 빠른 조회를 위해 SQLite를 골랐다.",
    "successor": {
      "kind": "decision",
      "title": "기록을 SQLite에 저장",
      "scope": "pkg/storage",
      "key": "storage-backend",
      "body": {
        "decision": "기록을 로컬 SQLite 데이터베이스에 저장한다.",
        "rationale": "파일로는 기록 간 조회가 너무 느려졌다.",
        "rejected_alternatives": ["로컬 Markdown 파일: 조회가 너무 느리다."]
      }
    }
  },
  "comparison": <result.receipt>,
  "semanticReview": {
    "judgments": [
      { "id": "<current-id>", "judgment": "replace", "reason": "같은 저장소 선택이며 사용자가 다른 방식을 골랐다." }
    ]
  }
}
EOF
node /loaded/whyve/skills/decision/scripts/decision_cli.mjs prepare --input /tmp/whyve-dec-supersede.json --approved --apply
```

`comparison`과 `semanticReview`가 없으면 결과는 `needs_review`이고 아무것도 쓰지 않는다. 이전 기록은 이력으로 `retired/`에 옮겨지고 후속 기록에는 `supersedes`가 남는다.

## Withdraw

후속 없이 선택을 거둘 때는 `note`가 필요하다.

```bash
cat > /tmp/whyve-dec-retire.json <<'EOF'
{ "mutation": { "action": "retire", "id": "<current-id>", "expectedDigest": "<current-contentDigest>", "reason": "withdrawn", "note": "사용자가 저장소 요구를 없앴다." } }
EOF
node /loaded/whyve/skills/decision/scripts/decision_cli.mjs prepare --input /tmp/whyve-dec-retire.json --approved --apply
```

`auto`/`adaptive`에서 사용자가 선택은 분명히 했지만 기록을 요청하지 않았다면 `--approved` 대신 `--policy-decision record --policy-reason '<이유>'`를 쓴다. 자세한 내용은 [decision 프로토콜](references/decision-protocol.ko.md)에 있다.
