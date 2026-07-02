# PROCESS — 중앙 로깅/에러-이벤트 시스템

> 베이스 룰: `CLAUDE.md` + `~/.claude/convention/*`(arrow only, 반환타입 추론, any/unknown 금지, 코드 주석 금지, named export, Factory DI + ServiceDb, `z.infer`/`ReturnType` 유도, 응답 헬퍼, 에러 3파일).
> 상세 설계: [logging.md](../logging.md) · 디바이스 계약: [firmware-logging-contract.md](../firmware-logging-contract.md).

## 작업: `log_events` 기반 통합 에러·이벤트 로깅

확정 결정: 서버 캡처=**모든 4xx+5xx** / 인증=**전용 `X-Device-Key`** / 범위=**전체** / 테스트=**DTO+서비스+캡처**.

- [x] a. 스키마·에러코드 — `db/schema.ts`(`logEvents`·`deviceKey`·`smallint` import), `lib/error-code.ts`·`error-message.ts`·`error.ts`(LOG_*). DDL 검증 완료(`drizzle-kit generate`).
- [x] a-1. **`bun run db:push`** — 실 DB(`hub`) 반영 완료. `log_events`(17컬럼·인덱스 4개)·`device_key`(8컬럼·token unique) 생성·검증 완료.
- [x] b. DTO — `dto/logs/log-event.ts`(ingest/batch/resolve/listQuery/response + SEVERITY), `dto/logs/device-key.ts`.
- [x] c. 서비스 — `service/domain/logs/log-event.ts`(`LogEventService`+`LogEventServiceDb`+`captureServerError`+`purgeByPolicy`), `device-key.ts`.
- [x] d. Compose — `compose/logs.ts`(Drizzle 구현 + throttle alerter), `compose/types.ts`·`compose/index.ts` 배선.
- [x] e. 수집/조회 API — `middleware/require-device-key.ts`, `route/logs/log-event.ts`·`device-key.ts`, `route/index.ts` 배선.
- [x] f. 전체 엔드포인트 서버 캡처 — `lib/log-service-name.ts`, `middleware/log-capture.ts`, `hono-types.ts`(errorDetail), `with-error-handling.ts`·`error-handler.ts`(errorDetail set), `middleware/index.ts`·`index.ts` 배선.
- [x] g. 어드민 — `page/admin/db.ts`(listLogEvents/resolveLogEvent/recentLogEvents/counts 확장), `pages/logs.tsx`, `index.ts`·`nav.ts`·`dashboard.tsx`.
- [x] h. 알림 — `lib/discord.ts` + alerter(severity≥40, throttle 60s).
- [x] i. 리텐션 — `purgeByPolicy`(7/30/180일) + `POST /api/logs/purge`(admin).
- [x] j. 문서 — `logging.md`, `firmware-logging-contract.md`, `PROCESS.md`, `admin-features.md` 갱신.
- [x] k. 테스트 — `tests/dto/logs`·`tests/service/domain/logs`·`tests/lib/log-service-name`·`tests/middleware/log-capture`. 어드민 mock(`tests/page/admin/helpers.ts`·`dashboard.test.ts`) 확장.
- [x] l. 검증 — `bunx tsc --noEmit` 0 errors / `bun test` **2051 pass, 0 fail**.

## 배포

- [x] `bun run db:push` — `hub` DB에 `log_events`·`device_key` 생성 완료.
- [x] `feat/logging-system` → `dev` fast-forward 머지 + `origin/dev` 푸시 완료(`a11dabe..6125fe6`). Vercel 배포 트리거.

## 남은 액션 (사용자)

1. 어드민에서 `POST /api/logs/device-keys` 로 디바이스 키 발급 → 펌웨어에 주입.
2. (선택) `DISCORD_WEBHOOK_URL` 설정 시 ERROR+ 알림 자동 활성.
3. (선택) cron/`/loop` 로 `POST /api/logs/purge` 주기 호출.
