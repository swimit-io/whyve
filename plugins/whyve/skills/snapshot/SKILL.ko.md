---
name: snapshot
description: 끝나지 않은 작업의 SNAP handoff를 사용자의 요청이나 프로젝트 기록 정책에 따라 저장·갱신·불러오기·폐기하고, 이전 작업을 이어갈 때 불러온다.
---

실행 요건: Node.js 20.20.0 이상. 이 패키지의 `.mjs` 진입점을 실행하고 `/loaded/whyve/skills/...`는 이 파일의 실제 경로에서 풀어 쓴다. Python, 전역 설치, `--help`, plugin script 읽기는 하지 않는다.

# Snapshot

SNAP은 바뀔 수 있는 재개용 맥락(`authority: staging`)이며 결정이나 근거 이력이 아니다. 설정, 승인, 결과 status는 [기록 정책](../context/references/recording-policy.md)을 따른다. 사용자에게 보이는 글은 active language, machine field는 English로 쓰고 사용자가 쓴 글은 그대로 둔다.

1. 이어가기: 사용자가 내용을 다시 말하지 않고 이전 작업을 이어가자고 하면 최근 SNAP 목록을 보고 맞는 것을 읽은 뒤, 거기 적힌 제약 안에서 Next steps와 Open items부터 이어간다. SNAP에 있는 내용을 사용자에게 다시 묻지 않는다.

   ```bash
   node /loaded/whyve/skills/context/scripts/context_cli.mjs snapshot list --order recent --limit 10
   node /loaded/whyve/skills/context/scripts/context_cli.mjs read '<snapshot-id>'
   ```

2. 저장은 작업이 끝나지 않았고 사용자가 handoff를 요청했을 때만 한다(`auto`/`adaptive` 정책은 그 요청을 대신한다). 내용과 범위를 정하는 직접적인 handoff 요청이 곧 승인이다. 확정되지 않은 의미만 묻고, 저장 여부를 다시 묻거나 렌더링된 파일을 보여주지 않는다. `current_context`(Markdown 전체 가능), `open_items`, `next_steps`를 채우고, 필요하면 `decided`, `references`, `capture_candidates`도 쓴다. 정확한 다음 단계와 사용자가 준 제약을 모두 적는다.

   ```bash
   cat > /tmp/whyve-snap.json <<'EOF'
   {
     "mutation": {
       "action": "capture",
       "record": {
         "kind": "snapshot",
         "title": "0.3 문서 작업 인계",
         "scope": "pkg/docs",
         "body": {
           "current_context": "skill은 다시 썼고 README와 MIGRATION이 남았다.",
           "open_items": ["README 새 소식", "MIGRATION 절차"],
           "next_steps": ["README.md를 고친 뒤 npm test 실행"]
         }
       }
     }
   }
   EOF
   node /loaded/whyve/skills/context/scripts/context_cli.mjs prepare --input /tmp/whyve-snap.json --approved --apply
   ```

3. 갱신은 내용을 교체한다. `replaceBody: true`이면 빠진 선택 section은 지워지고, 없으면 준 section만 바뀐다. `read`의 `contentDigest`를 쓴다.

   ```bash
   cat > /tmp/whyve-snap-update.json <<'EOF'
   {
     "mutation": {
       "action": "update",
       "id": "<snapshot-id>",
       "expectedDigest": "<snapshot-contentDigest>",
       "patch": {
         "replaceBody": true,
         "body": {
           "current_context": "README는 고쳤고 MIGRATION이 남았다.",
           "open_items": ["MIGRATION 절차"],
           "next_steps": ["MIGRATION 절 작성"]
         }
       }
     }
   }
   EOF
   node /loaded/whyve/skills/context/scripts/context_cli.mjs prepare --input /tmp/whyve-snap-update.json --approved --apply
   ```

4. 끝난 SNAP 하나는 `{"mutation":{"action":"discard","id":"<snapshot-id>","expectedDigest":"<snapshot-contentDigest>"}}`로 폐기한다. SNAP에는 이력이 없고, 다른 기록이 참조하는 SNAP은 폐기할 수 없다.

본문 한도는 256 KiB(UTF-8 262,144 byte)다. 넘으면 `needs_archive`가 나오고 아무것도 바뀌지 않는다. 내용을 몰래 줄이거나 나누지 않는다. Markdown 구조를 깨는 text(예: `## `로 시작하는 줄)는 자동으로 감싸 저장하고 그대로 읽어 온다. receipt가 기록 확인이므로 다시 읽지 않는다.
