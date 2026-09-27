# Whyve 0.3.0

Node.js 20.20.0 이상에서 패키지의 코어와 `.mjs` 진입점을 실행합니다. Python은 필요하지 않습니다.

프로젝트 맥락을 이어주는 단일 플러그인입니다.

`$whyve:init`에서 무엇을 기록할지와 기록 방식(`explicit`, `auto`, `adaptive`)을 고릅니다. 기록은 프로젝트 `context/` 폴더의 Markdown 파일이며, 기능을 꺼도 지워지지 않습니다. 기록 전에 언제 물어보는지는 [공통 기록 정책](skills/context/references/recording-policy.md), 기록 종류별 모양은 [templates](templates/)를 참고하세요.
