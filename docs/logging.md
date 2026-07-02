# 중앙 로깅 / 에러-이벤트 시스템 (`log_events`)

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 다루는 코드: `db/schema.ts`(`logEvents`·`deviceKey`), `dto/logs/*`, `service/domain/logs/*`, `compose/logs.ts`, `route/logs/*`, `route/index.ts`, `middleware/log-capture.ts`, `middleware/require-device-key.ts`, `middleware/index.ts`, `lib/log-service-name.ts`, `lib/discord.ts`, `lib/token-utils.ts`, `lib/with-error-handling.ts`·`middleware/error-handler.ts`, `lib/error-code.ts`·`lib/error-message.ts`·`lib/error.ts`, `compose/ai.ts`(`logUsage` — AI 사용기록 직접 적재).

> b-hub 전 도메인과 외부 디바이스(ESP32 등)가 공통으로 쓰는 **단일 에러·이벤트 저장소**.
> 세 가지 입력 경로 — ① 디바이스가 직접 올리는 이벤트, ② 기존 모든 API 엔드포인트의 서버 측 4xx·5xx 자동 캡처, ③ 서버 측 도메인이 `logEventService.ingest` 로 직접 남기는 사용·이벤트 기록(에러가 아닌 성공 INFO 포함 — 현재 AI 도메인) — 가 같은 `log_events` 테이블로 모인다.

---

## 1. 데이터 모델 (`db/schema.ts`)

### `log_events`

| column | type (MySQL) | 비고 |
|--------|--------------|------|
| `id` | `bigint AUTO_INCREMENT` | PK. 대량 로그 대비 bigint. |
| `service` | `varchar(64)` | 논리 서비스 식별자(`b-hub-mail`, `esp32-weather` …) |
| `error_code` | `varchar(64)` | 안정적 코드(`MAIL_PROVIDER_ERROR`, `ESP_WIFI_DOWN` …) |
| `error_description` | `text` | 사람이 읽는 메시지 |
| `severity` | `smallint` (default 20) | DEBUG10 / INFO20 / WARN30 / ERROR40 / FATAL50 |
| `category` | `varchar(64)` | network / parse / state / hardware … |
| `device_id` | `varchar(64)` | MAC 기반 등 |
| `firmware_version` | `varchar(32)` | 회귀 추적 |
| `source` | `varchar(32)` | `device` / `server` |
| `correlation_id` | `varchar(36)` | 같은 원인 묶기 |
| `session_id` | `varchar(36)` | 디바이스 boot 세션 |
| `retry_count` | `smallint` | 재시도 횟수 |
| `occurred_at` | `datetime(3)` | **클라이언트 벽시계**. nullable(NTP 전). |
| `resolved_at` | `datetime(3)` | 해소 시각. NULL = 미해소 |
| `details` | `json` | 자유 컨텍스트(nullable, default 없음) |
| `ingest_ip` | `varchar(45)` | 서버가 기록한 요청 IP |
| `created_at` | `timestamp(3)` default now | **서버** insert 시각(권위 시각) |

인덱스: `(service, created_at)`, `(device_id, created_at)`, `(error_code, resolved_at)`, `(severity, created_at)`.

### Postgres → MySQL 번역 결정

- `bigserial`→`bigint AUTO_INCREMENT`, `timestamptz`→`timestamp(3)`/`datetime(3)`, `jsonb`→`json`, `inet`→`varchar(45)`.
- `occurred_at`/`resolved_at` 는 **`datetime(3)`** 사용: 클라이언트 벽시계를 TZ 변환 없이 저장, nullable, 2038/암묵 default 회피. `created_at` 만 `timestamp(3).defaultNow()`.
- MySQL 은 **partial index·GIN(jsonb_path_ops) 미지원** → `(error_code, resolved_at)` 는 전체 복합 인덱스, `details` 는 인덱싱하지 않음.
- `json` 컬럼은 **default 불가** → nullable 로 둠(MySQL 8.0.13+ 필요).
- 파티셔닝은 추후 과제(`created_at` 인덱스로 prune 비용은 저렴).

### `device_key`

디바이스 전용 인증 키(weather 키와 완전 분리). `token`(sha256 해시) / `device_id` / `label` / `daily_limit`(기본 2000) / `last_used_at` / `revoked_at`.

---

## 2. 서버 측 자동 캡처 — "모든 엔드포인트"

기존 모든 API 엔드포인트의 에러를 코드 수정 없이 적재하기 위해 **단일 post-response 미들웨어** `middleware/log-capture.ts` 를 사용한다(휴면 상태였던 `requestLogger` 패턴 차용).

```
요청 → [cors] → [securityHeaders] → [logCapture] → [errorHandler] → 라우트(+ withErrorHandling)
                                       └ next() 후 c.res.status 를 읽어 적재
```

- `status >= 400` 이면 `logEventService.captureServerError(...)` 를 **fire-and-forget**(`.catch(captureException)`)로 호출. 사용자 결정에 따라 **모든 4xx + 5xx** 를 적재한다.
- `service` 는 `lib/log-service-name.ts` 의 `serviceNameFromPath()` 로 경로에서 도출, `severity` 는 `severityFromStatus()`(5xx=40, 4xx=30), `error_code` 는 `c.get('errorCode')`(AppError) 또는 status 폴백.
- `error_description` 은 `c.get('errorDetail')`(미처리 예외의 실제 메시지) 또는 코드 메시지. 캐치 지점(`lib/with-error-handling.ts`·`middleware/error-handler.ts`)은 **DB·서비스 결합 없이** `c.set('errorDetail', ...)` 한 줄만 추가한다.

### 불변식 (중복·재귀 없음)

- **단일 적재 지점**: 어떤 계층(validator 400, 인증 throw, 핸들러 에러)이 만든 응답이든 logCapture 가 *최종 status* 한 번만 읽으므로 **중복 적재 없음**.
- **재귀 없음**: 적재는 직접 DB write(앱을 다시 거치지 않음). 실패는 `.catch(captureException)` 에서 종료.
- **자기참조 차단**: `/api/logs` 경로는 캡처를 skip(디바이스 수집 엔드포인트의 자기 에러 노이즈 방지).
- **응답 비차단**: 미들웨어 전체가 try/catch 로 감싸여 절대 throw 하지 않음.

### 도메인 직접 적재 (사용·이벤트 기록)

위 자동 캡처(②)와 별개로, 서버 측 도메인은 HTTP 를 거치지 않고 `logEventService.ingest(...)` 를 직접 호출해 `log_events` 에 남길 수 있다 — 에러뿐 아니라 **성공 INFO(severity 20)** 도 적재하므로 이 테이블은 순수 에러 저장소가 아니다. 현재 사용처는 **AI 도메인**(`compose/ai.ts` 의 `logUsage`): `service='b-hub-ai'`·`category='ai'`·`source='server'` 로 완료(`AI_*_COMPLETED`, 20)·실패(`AI_*_FAILED`, 40)를 남긴다. 그 결과 성공 기록은 §5 상 7일 보관·Discord 없음, 실패 기록은 180일 보관 + Discord 알림(§4). 실패는 도메인이 재-throw 하므로 **같은 요청이 usage 행과 자동 캡처 HTTP 에러 행 2건**으로 남는다(두 행의 `service` 가 다르다 — usage 행은 `b-hub-ai`, 자동 캡처 행은 `serviceNameFromPath` 에 `/api/ai` 분기가 없어 폴백 `b-hub-api`). 적재 스키마·상세는 [domains/ai.md](./domains/ai.md) §사용기록 이 소유.

> 접근 로그(`apiRequestLog`)·weather 레이트리밋 로그(`weatherApiLog`)는 별개 관심사로 **변경하지 않음**. 어드민 에러 위젯은 `log_events` 기준으로 추가됨.

---

## 3. 수집 API (`route/logs/`)

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/api/logs` | `X-Device-Key` | 단건 수집 |
| POST | `/api/logs/batch` | `X-Device-Key` | 배치 수집(최대 50, 초과 시 413 `LOG_BATCH_TOO_LARGE`) |
| POST | `/api/logs/purge` | admin | 보관기간 경과 정리 |
| PATCH | `/api/logs/:id/resolve` | admin | 해소 처리 |
| GET | `/api/logs` | admin | 목록/필터 조회 |
| GET / POST | `/api/logs/device-keys` | admin | 목록 조회 / 발급(응답에 평문 키 1회, DB엔 sha256 해시 저장) |
| DELETE | `/api/logs/device-keys/:id` | admin | 폐기(`revoked_at` 기록) |

- 디바이스 인증 `middleware/require-device-key.ts`: `X-Device-Key` 검증 + 디바이스별 24h 레이트리밋(`log_events` 카운트). weather 키/쿼터/로그와 **무관**.
- 흐름: Route(DTO 검증 `dto/logs/`·인증·`createAppError`) → `service/domain/logs/log-event.ts`(순수 로직) → `LogEventServiceDb`(compose `compose/logs.ts` 의 Drizzle 구현).

---

## 4. 알림 (Discord)

- `lib/discord.ts` `sendDiscordAlert()`. `createLogEventService` 의 주입 `alerter` 가 **severity ≥ 40** 에서만 fire-and-forget 호출(`ingest`·`ingestBatch`·`captureServerError` 공통).
- `compose/logs.ts` 에서 `service:errorCode` 키로 **60초 throttle**(아웃에이지 시 폭주 방지). `DISCORD_WEBHOOK_URL` 미설정 시 알림 off.

---

## 5. 리텐션

- `logEventService.purgeByPolicy()` → `LogEventServiceDb.deleteOlderThan(before, maxSeverity)` 3계층:
  - DEBUG·INFO(<30): 7일 / WARN(30): 30일 / ERROR·FATAL(≥40): 180일.
- 실행: 어드민 `POST /api/logs/purge` 또는 외부 cron(`/loop` 등)으로 주기 호출. MySQL event scheduler 는 호스팅 의존이라 앱 주도 방식 권장.

---

## 6. 어드민

- 어드민 UI(`/admin/logs` 필터·resolve 액션, 대시보드 `Log Errors (24h)` Stat·`최근 로그 이벤트` 섹션)는 [admin-features.md](./admin-features.md) §5(Log Events)·§0(Dashboard) 가 소유 — 상세는 그쪽 참조.
- 데이터 계층(`page/admin/db.ts`): `listLogEvents`(목록·필터) / `recentLogEvents`(대시보드) / `resolveLogEvent`(해소) / `counts`(24h `logEvents24h`·`logErrors24h`).

---

## 7. 에러 코드

`lib/error-code.ts`·`lib/error-message.ts`·`lib/error.ts` 3파일에 동시 추가:
`LOG_EVENT_NOT_FOUND`(404), `LOG_BATCH_TOO_LARGE`(413), `LOG_INGEST_FAILED`(500), `LOG_DEVICE_KEY_INVALID`(401), `LOG_DEVICE_KEY_RATE_LIMIT`(429).

디바이스 측 코드 네이밍 규약은 [firmware-logging-contract.md](./firmware-logging-contract.md) 참고.
