# 로그(logs) 도메인

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 다루는 코드: `route/logs/log-event.ts`, `route/logs/device-key.ts`, `service/domain/logs/log-event.ts`, `service/domain/logs/device-key.ts`, `dto/logs/log-event.ts`, `dto/logs/device-key.ts`, `compose/logs.ts`, `compose/types.ts`, `middleware/require-device-key.ts`, `middleware/log-capture.ts`, `lib/log-service-name.ts`, `lib/discord.ts`, `lib/token-utils.ts`, `route/index.ts`, `index.ts`, `middleware/index.ts`, `db/schema.ts`, `lib/error-code.ts`, `lib/error-message.ts`, `lib/error.ts`

## 개요

- b-hub 전 도메인과 외부 디바이스(ESP32 등)가 공유하는 단일 에러·이벤트 저장소(`log_events`) 도메인. 입력 경로는 두 가지 — 디바이스 직접 수집, 서버 전 엔드포인트의 4xx·5xx 자동 캡처 — 로 같은 테이블에 모인다.
- 데이터 모델(`log_events`·`device_key` 컬럼)·서버 자동 캡처 설계·알림 throttle·리텐션 정책 등 상세 설계는 이 문서에서 서술하지 않는다. [../logging.md](../logging.md) 가 정본이며, 이 문서는 파일 맵·엔드포인트·흐름 요약만 담는다.

## 파일 맵

| 파일 | 역할 |
|---|---|
| `route/logs/log-event.ts` | HTTP 경계 — `createLogEventRoute`. 수집 2개(POST `/`·`/batch`, `requireDeviceKey`) + 어드민 3개(GET `/`·POST `/purge`·PATCH `/:id/resolve`, `withAdmin`) |
| `route/logs/device-key.ts` | HTTP 경계 — `createDeviceKeyRoute`. 디바이스 키 GET/POST/DELETE, 전부 `withAdmin` |
| `service/domain/logs/log-event.ts` | 도메인 로직 — `createLogEventService`(ingest/ingestBatch/resolve/list/getById/captureServerError/purgeByPolicy), `LogEventServiceDb`·`LogAlerter` 인터페이스. severity ≥ `SEVERITY.ERROR`(40)일 때만 `alerter` 호출 |
| `service/domain/logs/device-key.ts` | 도메인 로직 — `createDeviceKeyService`(create/validate/checkRateLimit/revoke/listAll). 토큰은 `hashToken`(sha256) 저장, 24h 내 `log_events` 카운트로 `daily_limit` 레이트리밋 |
| `dto/logs/log-event.ts` | Zod 스키마 — `logEventIngestSchema`·`logEventBatchSchema`·`logEventResolveSchema`·`logEventListQuerySchema`·`logEventResponseSchema`, `SEVERITY` 상수(DEBUG10~FATAL50), 이름/숫자 severity 변환 |
| `dto/logs/device-key.ts` | Zod 스키마 — `deviceKeyCreateSchema`(deviceId/label optional), `deviceKeyResponseSchema` |
| `compose/logs.ts` | DI — `composeLogs`가 `LogEventServiceDb`를 Drizzle(`schema.logEvents`)로 인라인 구현하고 `deviceKeyService`(Drizzle `db` 직접 주입)까지 조립. `DISCORD_WEBHOOK_URL` 있으면 `service:errorCode` 키 60초 throttle `alerter` 주입 |
| `compose/types.ts` | `ComposeLogsArgs = ComposeCoreArgs`(`{ db, env }`) |
| `middleware/require-device-key.ts` | 디바이스 인증 — `X-Device-Key` 헤더 검증 + 레이트리밋. 실패 시 `LOG_DEVICE_KEY_INVALID`(401)·`LOG_DEVICE_KEY_RATE_LIMIT`(429) |
| `middleware/log-capture.ts` | 서버 자동 캡처 — `app.use('*')` post-response 미들웨어. `status >= 400`(단 `/api/logs` skip)이면 `captureServerError` fire-and-forget |
| `middleware/index.ts` | `logEventService` 존재 시 `logCapture`를 전역 등록(`cors`·`securityHeaders` 뒤, `errorHandler` 앞) |
| `lib/log-service-name.ts` | `serviceNameFromPath`(경로→`b-hub-*` 서비스명)·`severityFromStatus`(5xx=40/4xx=30)·`errorCodeFromStatus`(status→코드 라벨) |
| `lib/discord.ts` | `sendDiscordAlert` — Discord webhook POST(내용 1900자 컷) |
| `route/index.ts` | `/logs/device-keys`·`/logs` 프리픽스로 마운트(`stub` 래핑) |
| `index.ts` | API 라우터를 `/api`로 마운트 |
| `db/schema.ts` | `log_events`(`LogEvent`/`NewLogEvent`)·`device_key`(`DeviceKey`/`NewDeviceKey`) 테이블 정의 |
| `lib/error-code.ts` · `lib/error-message.ts` · `lib/error.ts` | `LOG_EVENT_NOT_FOUND`(404)·`LOG_BATCH_TOO_LARGE`(413)·`LOG_INGEST_FAILED`(500)·`LOG_DEVICE_KEY_INVALID`(401)·`LOG_DEVICE_KEY_RATE_LIMIT`(429) 코드·메시지·상태 |

## API 엔드포인트

`route/index.ts`에서 `/logs`·`/logs/device-keys`로 마운트되고, `index.ts`에서 라우터 전체가 `/api`로 마운트된다.

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| POST | `/api/logs` | `X-Device-Key`(`requireDeviceKey`) | 단건 수집. `source='device'` 기본, 응답 `{ id }` |
| POST | `/api/logs/batch` | `X-Device-Key`(`requireDeviceKey`) | 배치 수집(최대 50건, 초과 시 413 `LOG_BATCH_TOO_LARGE`). 응답 `{ count }` |
| GET | `/api/logs` | admin(`withAdmin`) | 목록/필터 조회(service·severityGte·category·deviceId·errorCode·correlationId·unresolved·from·to·limit·offset). `paginatedResponse` |
| POST | `/api/logs/purge` | admin(`withAdmin`) | 보관기간 경과 로그 정리. 응답 `{ infoDeleted, warnDeleted, errorDeleted }` |
| PATCH | `/api/logs/:id/resolve` | admin(`withAdmin`) | 해소 처리(`resolved_at` 기록). 없으면 404 `LOG_EVENT_NOT_FOUND` |
| GET | `/api/logs/device-keys` | admin(`withAdmin`) | 디바이스 키 목록 |
| POST | `/api/logs/device-keys` | admin(`withAdmin`) | 디바이스 키 발급. 평문 키는 응답 `{ key }`로 1회만 반환 |
| DELETE | `/api/logs/device-keys/:id` | admin(`withAdmin`) | 디바이스 키 폐기(`revoked_at` 기록) |

## 핵심 흐름

- **디바이스 수집**: 디바이스가 `X-Device-Key`로 POST `/api/logs`(단건)·`/api/logs/batch`(≤50) 호출 → `requireDeviceKey`(키 검증 + 24h 레이트리밋) → `logEventService.ingest`/`ingestBatch` → `log_events` insert(`source='device'`).
- **서버 자동 캡처**: 전역 `logCapture` 미들웨어가 응답 후 `status >= 400`(`/api/logs` 경로는 skip)이면 `serviceNameFromPath`·`severityFromStatus`·`errorCodeFromStatus`로 도출해 `logEventService.captureServerError`를 fire-and-forget 호출 → `log_events` insert(`source='server'`).
- **어드민 조회·해소**: 관리자가 GET `/api/logs`로 필터 조회, PATCH `/api/logs/:id/resolve`로 해소, POST `/api/logs/purge`로 리텐션 정리하며, 디바이스 키는 `/api/logs/device-keys` 어드민 API로 발급/폐기한다.

두 수집·캡처 경로 공통으로 severity ≥ 40이면 Discord 알림이 나간다(자동 캡처·중복 방지·throttle·리텐션 정책 상세는 [../logging.md](../logging.md)).

## 관련 문서

- [../logging.md](../logging.md) — 데이터 모델·서버 자동 캡처 설계·알림·리텐션·에러 코드 정본.
- [../firmware-logging-contract.md](../firmware-logging-contract.md) — 디바이스 측 필드·에러 코드 네이밍 규약.
- [../admin-features.md](../admin-features.md) §5 Log Events (`/admin/logs`) — 어드민 SSR 조회/해소 화면.
