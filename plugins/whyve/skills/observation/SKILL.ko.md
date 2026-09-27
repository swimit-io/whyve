---
name: observation
description: 다시 쓸 사실, 근거, 교훈을 권위 없는 OBS 맥락으로 보존하고 그 lifecycle을 다룬다.
---

실행 요건: Node.js 20.20.0 이상. 이 패키지의 `.mjs` 진입점을 실행하고 `/loaded/whyve/skills/...`는 이 파일의 실제 경로에서 풀어 쓴다. Python, 전역 설치, `--help`, plugin script 읽기는 하지 않는다.

# Observation

OBS는 다시 쓸 사실, 발견, 교훈을 `authority: evidence`로 기록한다. 앞으로 반드시 따라야 할 결정처럼 쓰지 않는다. 설정, 승인, 결과 status는 [기록 정책](../context/references/recording-policy.md)을 따른다. 사용자에게 보이는 글은 active language, machine field는 English로 쓰고 사용자가 쓴 글은 그대로 둔다.

관찰 내용, 범위, 기록 효과를 정하는 사용자의 직접적이고 명시적이며 조건 없는 말이 승인이다. 확정되지 않은 의미만 한 번 묻는다. 맞장구, 칭찬, 조건, 수정 요청, 화제 전환은 승인이 아니다. 렌더링된 파일을 보여주거나 저장 여부를 다시 묻지 않는다.

필드(`node /loaded/whyve/skills/context/scripts/context_cli.mjs schema observation`이 출력한다):

- `observation`(Observation section): 필수. 주장 자체.
- `evidence`(Evidence): 선택 목록. 어떻게 확인했는지(명령과 결과, 파일 경로, ARCHIVE `ctx_` ID). 없으면 quality flag `evidence_missing`이 붙을 뿐 기록은 저장된다. 근거가 있으면 적고, 지어내지 않는다.
- `impact`, `current_handling`, `followup_conditions`(목록): 선택.
- header(`body`에 넣는다): `verified_at`은 다시 확인했을 때 `update`로 넣는다(`created_at`보다 이를 수 없다). `kind_hint: "decision"`은 나중에 사용자가 DEC로 확정할 수 있는 결정 성격의 기록에 쓴다.
- 본문 전체(Sources 제외)는 UTF-8 262,144 byte(256 KiB) 이하이며 넘으면 `needs_archive`가 나온다. 항목 수 제한은 없다. 뜻이 바뀌도록 근거를 잘라내지 않는다.

```bash
cat > /tmp/whyve-obs.json <<'EOF'
{
  "mutation": {
    "action": "capture",
    "record": {
      "kind": "observation",
      "title": "Git 병합 뒤 index 재생성이 필요하다",
      "scope": "pkg/storage",
      "body": {
        "observation": "두 branch가 모두 기록을 추가한 뒤 Git으로 병합하면 area index에 양쪽 행이 함께 남는다.",
        "evidence": ["git merge feature-a 결과 union index가 생김", "whyve refresh --fix로 기록당 한 행으로 복구됨"],
        "impact": "고치지 않은 index는 strict 조회에서 실패한다."
      }
    }
  }
}
EOF
node /loaded/whyve/skills/context/scripts/context_cli.mjs prepare --input /tmp/whyve-obs.json --approved --apply
```

Lifecycle(`read`의 `contentDigest`를 쓴다):

- `update`는 보충만 한다. 빈 선택 section을 채우거나 이어 쓴다(예: 근거 추가, 새 근거와 함께 `verified_at` 설정). 주장이 바뀌면 새 기록으로 `supersede`하며, 기록 정책대로 `compare` 뒤 이전 기록을 `replace`로 판단한다.
- `retire`의 `reason: "invalidated"`에는 실제 반증을 담은 `note`가 필요하다. 오래됐다는 이유만으로 근거를 거두지 않는다.
- `discard`는 다른 기록이 참조하지 않는 OBS를 지운다.
