# 로그(logs) 도메인

> 기준: 2026-09-07 (fix/audit-batch4-performance @ 4차 배치 커밋분) 코드 검증. 다루는 코드: `route/logs/log-event.ts`, `route/logs/purge.ts`, `route/logs/device-key.ts`, `lib/cron-auth.ts`, `service/domain/logs/log-event.ts`, `service/domain/logs/device-key.ts`, `dto/logs/log-event.ts`, `dto/logs/device-key.ts`, `compose/logs.ts`, `compose/types.ts`, `middleware/require-device-key.ts`, `middleware/log-capture.ts`, `lib/log-service-name.ts`, `lib/discord.ts`, `lib/token-utils.ts`, `route/index.ts`, `index.ts`, `middleware/index.ts`, `db/schema.ts`, `lib/error-code.ts`, `lib/error-message.ts`, `lib/error.ts`

## 개요

- b-hub 전 도메인과 외부 디바이스(ESP32 등)가 공유하는 단일 에러·이벤트 저장소(`log_events`) 도메인. 입력 경로는 두 가지 — 디바이스 직접 수집, 서버 전 엔드포인트의 4xx·5xx 자동 캡처 — 로 같은 테이블에 모인다.
- 데이터 모델(`log_events`·`device_key` 컬럼)·서버 자동 캡처 설계·알림 throttle·리텐션 정책 등 상세 설계는 이 문서에서 서술하지 않는다. [../logging.md](../logging.md) 가 정본이며, 이 문서는 파일 맵·엔드포인트·흐름 요약만 담는다.

## 파일 맵

| 파일 | 역할 |
|---|---|
| `route/logs/log-event.ts` | HTTP 경계 — `createLogEventRoute`. 수집 2개(POST `/`·`/batch`, `requireDeviceKey` + `bodyLimit` 1MB) + 어드민 3개(GET `/`·POST `/purge`·PATCH `/:id/resolve`, `withAdmin`) + 크론 서브라우트 마운트(`/purge`) |
| `route/logs/purge.ts` | HTTP 경계 — `createLogPurgeRoute`. **`GET /api/logs/purge` 전용**(Vercel Cron). `verifyCronAuth`(`Authorization: Bearer` 또는 `x-cron-secret`)로 인증하고 `purgeByPolicy` + `purgeRetention` 결과를 합쳐 반환. 시크릿은 주입값 ?? `getEnv().UPLOAD_SERVER_SECRET` |
| `route/logs/device-key.ts` | HTTP 경계 — `createDeviceKeyRoute`. 디바이스 키 GET/POST/DELETE, 전부 `withAdmin` |
| `service/domain/logs/log-event.ts` | 도메인 로직 — `createLogEventService`(ingest/ingestBatch/resolve/list/getById/captureServerError/purgeByPolicy/**purgeRetention**), `LogEventServiceDb`·`LogAlerter` 인터페이스. severity ≥ `SEVERITY.ERROR`(40)일 때만 `alerter` 호출(실패는 `captureException`) |
| `service/domain/logs/device-key.ts` | 도메인 로직 — `resolveDeviceIdentity`(키 식별자 = `device_id ?? 'key:<id>'`) + `createDeviceKeyService`(create/validate/checkRateLimit/revoke/listAll). 토큰은 `hashToken`(sha256) 저장, 24h 내 `log_events` 카운트로 `daily_limit` 레이트리밋 |
| `dto/logs/log-event.ts` | Zod 스키마 — `logEventIngestSchema`·`logEventBatchSchema`·`logEventResolveSchema`·`logEventListQuerySchema`·`logEventResponseSchema`, `SEVERITY` 상수(DEBUG10~FATAL50), 이름/숫자 severity 변환 |
| `dto/logs/device-key.ts` | Zod 스키마 — `deviceKeyCreateSchema`(deviceId/label optional), `deviceKeyResponseSchema` |
| `compose/logs.ts` | DI — `composeLogs`가 `LogEventServiceDb`를 Drizzle(`schema.logEvents`·`weatherApiLog`·`mailSyncLogs`·`mailSyncSessions`)로 인라인 구현하고 `deviceKeyService`(Drizzle `db` 직접 주입)까지 조립. `listEvents` 는 **count 와 목록 select 를 `Promise.all` 로 동시에** 실행한다(감사 P-01, 응답 불변). `DISCORD_WEBHOOK_URL` 있으면 `service:errorCode` 키 60초 throttle `alerter` 주입(키 상한 500, 만료 키는 prune) |
| `compose/types.ts` | `ComposeLogsArgs = ComposeCoreArgs`(`{ db, env }`) |
| `middleware/require-device-key.ts` | 디바이스 인증 — `X-Device-Key` 헤더 검증 + 레이트리밋. 실패 시 `LOG_DEVICE_KEY_INVALID`(401)·`LOG_DEVICE_KEY_RATE_LIMIT`(429) |
| `middleware/log-capture.ts` | 서버 자동 캡처 — `app.use('*')` post-response 미들웨어. `status >= 400`(단 `/api/logs` skip)이면 `captureServerError` 를 **응답 전 `await`**(실패는 `captureException`) |
| `middleware/index.ts` | `logEventService` 존재 시 `logCapture`를 전역 등록(`cors`·`securityHeaders` 뒤, `errorHandler` 앞) |
| `lib/log-service-name.ts` | `serviceNameFromPath`(경로→`b-hub-*` 서비스명)·`severityFromStatus`(5xx=40/4xx=30)·`errorCodeFromStatus`(status→코드 라벨) |
| `lib/discord.ts` | `sendDiscordAlert` — Discord webhook POST(내용 1900자 컷, `allowed_mentions: { parse: [] }`, 3초 timeout, 분당 20건 전역 예산, 비2xx 면 `EXTERNAL_API_ERROR` throw) + 테스트용 `resetDiscordAlertBudget` |
| `route/index.ts` | `/logs/device-keys`·`/logs` 프리픽스로 마운트(`stub` 래핑) |
| `index.ts` | API 라우터를 `/api`로 마운트 |
| `db/schema.ts` | `log_events`(`LogEvent`/`NewLogEvent`)·`device_key`(`DeviceKey`/`NewDeviceKey`) 테이블 정의 |
| `lib/error-code.ts` · `lib/error-message.ts` · `lib/error.ts` | `LOG_EVENT_NOT_FOUND`(404)·`LOG_BATCH_TOO_LARGE`(413)·`LOG_INGEST_FAILED`(500)·`LOG_DEVICE_KEY_INVALID`(401)·`LOG_DEVICE_KEY_RATE_LIMIT`(429) 코드·메시지·상태 |

## API 엔드포인트

`route/index.ts`에서 `/logs`·`/logs/device-keys`로 마운트되고, `index.ts`에서 라우터 전체가 `/api`로 마운트된다.

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| POST | `/api/logs` | `X-Device-Key`(`requireDeviceKey`) | 단건 수집. `source='device'` 기본, 응답 `{ id }`. **본문 1MB 초과 시 413 `LOG_BATCH_TOO_LARGE`** |
| POST | `/api/logs/batch` | `X-Device-Key`(`requireDeviceKey`) | 배치 수집(최대 50건, 초과 시 413 `LOG_BATCH_TOO_LARGE`). 응답 `{ count }`. **본문 1MB 상한도 같은 코드** |
| GET | `/api/logs` | admin(`withAdmin`) | 목록/필터 조회(service·severityGte·category·deviceId·errorCode·correlationId·unresolved·from·to·limit·offset). `paginatedResponse` |
| GET | `/api/logs/purge` | cron secret(`verifyCronAuth`) | **Vercel Cron 전용**(`40 4 * * *`). 정책 삭제 + 보존 삭제. 응답 `{ infoDeleted, warnDeleted, errorDeleted, weatherApiLogDeleted, mailSyncLogDeleted, mailSyncSessionDeleted }` |
| POST | `/api/logs/purge` | admin(`withAdmin`) | 보관기간 경과 로그 정리(수동). 응답 `{ infoDeleted, warnDeleted, errorDeleted }` — 보존 삭제는 포함하지 않는다 |
| PATCH | `/api/logs/:id/resolve` | admin(`withAdmin`) | 해소 처리(`resolved_at` 기록). 없으면 404 `LOG_EVENT_NOT_FOUND` |
| GET | `/api/logs/device-keys` | admin(`withAdmin`) | 디바이스 키 목록 |
| POST | `/api/logs/device-keys` | admin(`withAdmin`) | 디바이스 키 발급. 평문 키는 응답 `{ key }`로 1회만 반환 |
| DELETE | `/api/logs/device-keys/:id` | admin(`withAdmin`) | 디바이스 키 폐기(`revoked_at` 기록) |

## 핵심 흐름

- **디바이스 수집**: 디바이스가 `X-Device-Key`로 POST `/api/logs`(단건)·`/api/logs/batch`(≤50) 호출 → `requireDeviceKey`(키 검증 + 24h 레이트리밋) → `logEventService.ingest`/`ingestBatch` → `log_events` insert(`source='device'`).
    - **저장되는 `device_id` 는 키에서 강제**된다. 미들웨어가 `resolveDeviceIdentity`(키의 `device_id`, 없으면 `key:<키 id>`)를 컨텍스트 `deviceKeyDeviceId` 에 넣고, 라우트가 단건·배치 모두 그 값으로 요청 본문의 `deviceId` 를 덮어쓴다. 레이트리밋 집계도 같은 값 기준이라 본문으로 한도를 우회할 수 없다.
    - 배치 크기 사전 검사(50건 초과 → `LOG_BATCH_TOO_LARGE`)는 종전과 같다.
- **서버 자동 캡처**: 전역 `logCapture` 미들웨어가 `status >= 400`(`/api/logs` 경로는 skip)이면 `serviceNameFromPath`·`severityFromStatus`·`errorCodeFromStatus`로 도출해 `logEventService.captureServerError`를 **응답 반환 전에 `await`** 한다 → `log_events` insert(`source='server'`). 서버리스에서 응답 후 실행이 끊겨 오류 로그가 유실되던 경로를 막는다(insert 실패만 `captureException` 으로 흡수).
- **어드민 조회·해소**: 관리자가 GET `/api/logs`로 필터 조회, PATCH `/api/logs/:id/resolve`로 해소, POST `/api/logs/purge`로 리텐션 정리하며, 디바이스 키는 `/api/logs/device-keys` 어드민 API로 발급/폐기한다. 목록 조회의 총건수 count 와 행 select 는 같은 `where` 로 **병렬 실행**된다(`compose/logs.ts` `listEvents`) — 두 쿼리가 같은 스냅샷이 아니므로 조회 중 삽입·삭제가 겹치면 `total` 과 페이지 행이 미세하게 어긋날 수 있다(직렬 실행 때도 존재하던 성질).
- **크론 정리**: Vercel Cron 이 매일 04:40(UTC) `GET /api/logs/purge` 를 호출한다. 크론은 GET 만 받으므로 어드민 POST 경로와 충돌하지 않는다(`Authorization` 헤더를 실은 admin POST 가 크론 분기로 흡수되던 문제 때문에 GET 전용으로 좁혔다 — [../acknowledge/2026-09-06-consumer-repos-and-compat.md](../acknowledge/2026-09-06-consumer-repos-and-compat.md)).

두 수집·캡처 경로 공통으로 severity ≥ 40이면 Discord 알림이 나간다. **알림은 응답을 기다리지 않는다**(fire-and-forget — 로그 수집 응답에 웹훅 왕복을 얹지 않기 위함). 자동 캡처·중복 방지·throttle·예산·리텐션 정책 상세는 [../logging.md](../logging.md).

## 관련 문서

- [../logging.md](../logging.md) — 데이터 모델·서버 자동 캡처 설계·알림·리텐션·에러 코드 정본.
- [../firmware-logging-contract.md](../firmware-logging-contract.md) — 디바이스 측 필드·에러 코드 네이밍 규약.
- [../admin-features.md](../admin-features.md) §5 Log Events (`/admin/logs`) — 어드민 SSR 조회/해소 화면.
