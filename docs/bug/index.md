# bug/ — 버그 기록

> 버그 1건 = 1파일. 필수 항목: 대상 파일 / 증상 / 근본 원인 / 해결 / (있으면) 재발 방지·백필. (`~/.claude/convention/ai-process.md` §9)

## 목록

| 파일 | 요약 | 상태 |
|------|------|------|
| [mail-imap-thread-id.md](./mail-imap-thread-id.md) | IMAP 메일이 thread 로 안 묶임 — `thread_id` 미설정. References 헤더 기반 `deriveThreadId` 도입 + 백필 스크립트 | 해결 (커밋 `81d1573`) |
