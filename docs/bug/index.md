# bug/ — 버그 기록

> 버그 1건 = 1파일. 필수 항목: 대상 파일 / 증상 / 근본 원인 / 해결 / (있으면) 재발 방지·백필. (`~/.claude/convention/ai-process.md` §9)

## 목록

| 파일 | 요약 | 상태 |
|------|------|------|
| [2026-07-09-vercel-hono-detection-crash.md](./2026-07-09-vercel-hono-detection-crash.md) | Vercel production `/` 크래시(`Requested module is not instantiated yet`) — 빌더 hono 자동 감지 + better-auth 1.6 exports 조건 불일치. `framework: null` + JS 셔임 `api/index.js` + 번들 `api/hub.js` 로 해소 | 해결 (커밋 `e26ab62`·`c005003`·`09e13e1`) |
| [mail-imap-thread-id.md](./mail-imap-thread-id.md) | IMAP 메일이 thread 로 안 묶임 — `thread_id` 미설정. References 헤더 기반 `deriveThreadId` 도입 + 백필 스크립트 | 해결 (커밋 `81d1573`) |
