---
name: archive
description: 오래 남길 맥락의 근거로 채택된 긴 원문을 바뀌지 않는 형태로 보존한다.
---

실행 요건: Node.js 20.20.0 이상. 이 패키지의 `.mjs` 진입점을 실행하고 `/loaded/whyve/skills/...`는 이 파일의 실제 경로에서 풀어 쓴다. Python, 전역 설치, `--help`, plugin script 읽기는 하지 않는다.

# Archive

ARCHIVE(`context-archive/v2`, `authority: evidence`)는 오래 남길 기록을 뒷받침하는 원문을 바꾸지 않고 보관한다. 산출물 저장소가 아니며 OBS, DEC, INTENT, DOCUMENT를 대신하지 않는다. 설정, 승인, 결과 status는 [기록 정책](../context/references/recording-policy.md)을 따른다.

- 사용자가 근거로 채택한 원문만 기록한다. 원문과 범위를 정한 명시적인 보관 요청이 승인이다. 확정되지 않은 의미만 묻고 렌더링된 파일은 보여주지 않는다.
- `content`는 그대로 저장되며(UTF-8 524,288 byte 이하) core가 `content_digest`를 붙인다. `sources`에 `source` 항목을 넣는다. 없으면 `source_missing`이 붙는다. `original_format`(header, `body`에 넣음)으로 형식을 적는다.
- 한도를 넘으면 `needs_archive`와 `chunks`가 나온다. chunk마다 같은 출처를 적은 ARCHIVE로 따로 저장한다.
- ARCHIVE는 바뀌지 않는다. 내용 update가 없고, 같은 byte로 scope만 옮기는 경우 말고는 supersede도 없다. 다른 기록이 참조하는 동안에는 `discard`가 거부된다.
- 다른 기록에서는 ID로 인용한다. 예: OBS `evidence` 항목, `sources`의 `- evidence: ctx_…`. 원문이 실제로 필요할 때만 읽는다.

```bash
cat > /tmp/whyve-archive.json <<'EOF'
{
  "mutation": {
    "action": "capture",
    "record": {
      "kind": "archive",
      "title": "공급사 저장 약관 2026-09-20",
      "scope": "pkg/storage",
      "body": {
        "content": "제4조. 고객 데이터는 고객 기기에만 둔다.\n제5조. 호스팅 복제본을 두지 않는다.",
        "original_format": "text/plain"
      },
      "sources": [{ "relation": "source", "ref": "mail:vendor-2026-09-20" }]
    }
  }
}
EOF
node /loaded/whyve/skills/context/scripts/context_cli.mjs prepare --input /tmp/whyve-archive.json --approved --apply
```

사용자에게 보이는 글은 active language, machine field는 English로 쓴다.
