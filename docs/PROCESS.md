# PROCESS — 현재/누적 작업 상태

> 베이스 룰: `CLAUDE.md` + `~/.claude/convention/*`(arrow only, 반환타입 추론, any/unknown 금지, 코드 주석 금지, named export, Factory DI + ServiceDb, `z.infer`/`ReturnType` 유도, 응답 헬퍼, 에러 3파일).
> 문서 진입점: [index.md](./index.md) · 완료 작업 이력: [history/](./history/)

## 현재 진행 중 작업

### 의존성 최신화 (2026-07-02, 브랜치 `chore/deps-update`) — 결정 정본: [acknowledge/2026-07-02-deps-upgrade.md](./acknowledge/2026-07-02-deps-upgrade.md)

- [x] 안전 최신화(minor/patch 전부 + 저위험 major 7 + 보안 `nodemailer` 9) — tsc 0 · `bun test` 2268 pass · docs 버전 반영 · 커밋 `c70b372`.
- [ ] breaking major 3개 업그레이드(진행 중):
    - [x] ① `better-auth` 1.6.23 — TS2883(비-portable 추론) 3지점을 leaf(`createAuthProvider`)의 `BetterAuthOptions` 옵션 타입 + 명시 `Auth` 반환 annotation 으로 일괄 해소(compose 2곳은 연쇄 해결). `process.env.NODE_ENV` 직접접근도 `isProduction` deps 주입으로 정리. tsc 0 · 2268 pass.
    - [x] ② `hono` 4.12.27 — `c.req.param()` `string|undefined` 엄격화 35지점/18파일. 전 지점 라우트 경로 필수 param 확인 후 할당 지점 non-null(`!`) 처리(기본값 대입 0건, 기존 isNaN 가드 보존). tsc 0 · 2268 pass.
    - [ ] ③ `zod` 4 생태계(zod 4 + zod-openapi 6 + @hono/zod-validator 0.8 + hono-openapi 1) 동시 업그레이드 — dto/**·route/** 전수. tsc+test 후 독립 커밋.
    - [ ] 단계별 docs 갱신(reference/shared-services.md 등) → 완료 시 history 이관 + docs↔코드 정합 재검증 → 전체 test+tsc+prettier → 커밋·병합 여부 사용자 확인.

## 완료 작업 (이력)

- [history/2026-07-ai-provider-system.md](./history/2026-07-ai-provider-system.md) — AI Provider 시스템(codex/anthropic/ollama 멀티 프로바이더, 채팅·프롬프트·첨부, 자격증명 암호화, 사용기록). db:push 반영·커밋 완료. 후속 자체 감사(7렌즈×적대적 검증) 확정 32건 보완(쿼터·토큰레이스·고아메시지·레이트리밋 등) + docs 정합 9건, 2268 tests pass.
- [history/2026-07-docs-overhaul.md](./history/2026-07-docs-overhaul.md) — docs/ 전면 고도화.
- [history/2026-06-logging-system.md](./history/2026-06-logging-system.md) — `log_events` 중앙 로깅/에러-이벤트 시스템 (배포 완료, 2051 tests pass).
