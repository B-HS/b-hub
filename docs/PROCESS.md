# PROCESS — 현재/누적 작업 상태

> 베이스 룰: `CLAUDE.md` + `~/.claude/convention/*`(arrow only, 반환타입 추론, any/unknown 금지, 코드 주석 금지, named export, Factory DI + ServiceDb, `z.infer`/`ReturnType` 유도, 응답 헬퍼, 에러 3파일).
> 문서 진입점: [index.md](./index.md) · 완료 작업 이력: [history/](./history/)

## 현재 진행 중 작업

### 의존성 최신화 (2026-07-02, 브랜치 `chore/deps-update`) — 결정: [acknowledge/2026-07-02-deps-upgrade.md](./acknowledge/2026-07-02-deps-upgrade.md) · 이력: [history/2026-07-deps-upgrade.md](./history/2026-07-deps-upgrade.md)

- [x] 안전 최신화 + breaking major 3종(better-auth 1.6 · hono 4.12 · zod 4+hono-openapi 1) — 상세는 history 문서. 커밋 `c70b372`·`c3adc1f`·`b04e93f`·`5887a60`.
- [x] docs 갱신 + history 이관 + docs↔코드 정합 재검증.
- [x] FE 소비자 영향 검수 매뉴얼 작성 — [quality-assurance/fe-deps-impact-check.md](./quality-assurance/fe-deps-impact-check.md). FE 프로젝트별 검수는 사용자가 직접 수행.
- [ ] push·dev 병합 여부 사용자 확인 대기. `zod-openapi`·`@hono/zod-validator` 제거(업그레이드 대신) 결정도 사용자 확인 대상.

## 완료 작업 (이력)

- [history/2026-07-deps-upgrade.md](./history/2026-07-deps-upgrade.md) — 의존성 최신화(안전분+보안 nodemailer 9, better-auth 1.6·hono 4.12·zod 4+hono-openapi 1, 미사용 zod-openapi·zod-validator 제거). 단계별 tsc 0·2268 pass.
- [history/2026-07-ai-provider-system.md](./history/2026-07-ai-provider-system.md) — AI Provider 시스템(codex/anthropic/ollama 멀티 프로바이더, 채팅·프롬프트·첨부, 자격증명 암호화, 사용기록). db:push 반영·커밋 완료. 후속 자체 감사(7렌즈×적대적 검증) 확정 32건 보완(쿼터·토큰레이스·고아메시지·레이트리밋 등) + docs 정합 9건, 2268 tests pass.
- [history/2026-07-docs-overhaul.md](./history/2026-07-docs-overhaul.md) — docs/ 전면 고도화.
- [history/2026-06-logging-system.md](./history/2026-06-logging-system.md) — `log_events` 중앙 로깅/에러-이벤트 시스템 (배포 완료, 2051 tests pass).
