# PROCESS — 현재/누적 작업 상태

> 베이스 룰: `CLAUDE.md` + `~/.claude/convention/*`(arrow only, 반환타입 추론, any/unknown 금지, 코드 주석 금지, named export, Factory DI + ServiceDb, `z.infer`/`ReturnType` 유도, 응답 헬퍼, 에러 3파일).
> 문서 진입점: [index.md](./index.md) · 완료 작업 이력: [history/](./history/)

## 현재 진행 중 작업

### 의존성 최신화 (2026-07-02, 브랜치 `chore/deps-update`) — 결정 정본: [acknowledge/2026-07-02-deps-upgrade.md](./acknowledge/2026-07-02-deps-upgrade.md)

- [x] 안전 최신화(minor/patch 전부 + 저위험 major 7 + 보안 `nodemailer` 9) — tsc 0 · `bun test` 2268 pass · docs 버전 반영. **미커밋(워킹트리)**.
- [ ] breaking major 3개(**새 세션**): `hono` 4.12(param 40+지점)·`better-auth` 1.6(타입 3지점)·`zod` 4 생태계(37+지점). 새 세션 프롬프트는 acknowledge 문서에.

## 완료 작업 (이력)

- [history/2026-07-ai-provider-system.md](./history/2026-07-ai-provider-system.md) — AI Provider 시스템(codex/anthropic/ollama 멀티 프로바이더, 채팅·프롬프트·첨부, 자격증명 암호화, 사용기록). db:push 반영·커밋 완료. 후속 자체 감사(7렌즈×적대적 검증) 확정 32건 보완(쿼터·토큰레이스·고아메시지·레이트리밋 등) + docs 정합 9건, 2268 tests pass.
- [history/2026-07-docs-overhaul.md](./history/2026-07-docs-overhaul.md) — docs/ 전면 고도화.
- [history/2026-06-logging-system.md](./history/2026-06-logging-system.md) — `log_events` 중앙 로깅/에러-이벤트 시스템 (배포 완료, 2051 tests pass).
