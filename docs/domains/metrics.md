# metrics 도메인

> 기준: 2026-07-22 코드 검증. 다루는 코드: `route/metrics/ingest.ts`, `route/metrics/token.ts`, `route/metrics/query.ts`, `service/domain/metrics/token.ts`, `service/domain/metrics/log.ts`, `dto/metrics/token.ts`, `dto/metrics/ingest.ts`, `dto/metrics/query.ts`, `compose/metrics.ts`, `compose/types.ts`, `compose/index.ts`, `middleware/require-metrics-token.ts`, `db/schema.ts`(`metrics_token`), `db/mongo.ts`, `route/index.ts`, `index.ts`, `page/admin/pages/metrics.tsx`, `lib/error-code.ts`, `lib/error-message.ts`, `lib/error.ts`

## 개요

- 시스템 모니터링 대시보드(클라이언트 프로젝트명 **machboard**)의 수집 API 도메인. 클라이언트(Tauri 데스크톱/headless 데몬/ESP32)가 시스템 정보 JSON 을 주기 전송하면 저장·조회·시계열을 제공한다. 온라인/오프라인 판정은 조회 시점에 계산한다(별도 감시 크론·푸시 알림 없음 — 2026-07-22 사용자 결정으로 하트비트 크론+Discord 알림은 도입 직후 제거).
- **저장소가 하이브리드**다: 토큰 메타(별칭·scope·만료·폐기)는 **MySQL**(`metrics_token`), 수집 로그 본문과 디바이스 레지스트리는 **MongoDB**(`MONGODB_URI`, DB명 고정 `metrics`). 한 도메인이 관계형·문서형 두 저장소를 함께 쓰는 유일한 케이스다.
- **`MONGODB_URI` 미설정 시 graceful 비활성**: `composeMetrics` 가 `{}` 를 반환해 `metricsTokenService`/`metricsLogService` 가 미주입되고, metrics 라우트만 `SERVICE_NOT_CONFIGURED`(503, `stub`)로 실패한다. 앱 전체는 정상 부팅한다(ai 도메인의 `AI_ENCRYPTION_KEY` 패턴과 동일).
- 클라이언트 측 수집 계약(엔드포인트·헤더·필드·재시도)은 [../metrics-client-contract.md](../metrics-client-contract.md)가 정본이며, 여기서는 서버 파일 맵·엔드포인트·흐름·함정만 담는다.

### scope 체계

- 토큰 `scope` 는 `client`(수집 전용) / `admin`(수집 + 조회 + 토큰 관리) 2종(`METRICS_TOKEN_SCOPE`, `dto/metrics/token.ts`). 기본값 `client`.
- 수집(`/ingest`·`/ingest/batch`)은 `client` scope 로 충분하고, 조회·토큰 API(`/tokens`·`/devices`·`/logs`·`/series`)는 `admin` scope 를 요구한다(client 토큰이면 403 `METRICS_TOKEN_FORBIDDEN`). 인증은 `requireMetricsToken({ scope, checkRateLimit? })` 미들웨어가 강제한다.
- 최초 admin 토큰은 어드민 SSR(`/admin/metrics/tokens`)에서 발급한다([../admin-features.md](../admin-features.md) §5.5). 평문은 발급 1회만 표시(sha256 해시 저장).

## 데이터 모델

- **MySQL** `metrics_token`(`MetricsToken`/`NewMetricsToken`): `token`(sha256 해시, unique) · `alias` · `scope`(기본 `client`) · `daily_limit`(기본 20000) · `expires_at`(nullable) · `last_used_at` · `revoked_at` · `created_at`. 인덱스 `idx_metrics_token_scope`. 컬럼 전수는 [../reference/db-schema.md](../reference/db-schema.md) §metrics.
- **MongoDB**(비-Drizzle, `db/mongo.ts`, DB `metrics`):
  - `metrics_logs`(`MetricsLogDoc`): `tokenId`·`tokenAlias`·`deviceId`·`hostname`/`os`/`arch`/`agentVersion`(nullable)·`payload`(자유 JSON)·`receivedAt`. 인덱스 `{receivedAt:1}` **TTL 90일** + `{tokenId,receivedAt}` + `{deviceId,receivedAt}`.
  - `metrics_devices`(`MetricsDeviceDoc`): `deviceId`(unique)·`tokenId`·`tokenAlias`·메타(nullable)·`intervalSec`(nullable)·`firstSeenAt`·`lastSeenAt`. 인덱스 `{deviceId}` unique.
  - 인덱스는 `getMongo(uri)` 최초 호출 시 `createMongo` 가 fire-and-forget(`.catch(captureException)`)으로 보장하고, 싱글턴 종료용 `closeMongo` 도 제공한다.

## 파일 맵

| 파일 | 역할 |
|---|---|
| `route/metrics/ingest.ts` | HTTP 경계 — `createMetricsIngestRoute`. 단건 POST `/` + 배치 POST `/batch`(둘 다 `requireMetricsToken` client scope + rate limit). payload 직렬화 64KB 초과 413, 배치 50건 초과 413 |
| `route/metrics/token.ts` | HTTP 경계 — `createMetricsTokenRoute`. 토큰 GET/POST/DELETE, 전부 `requireMetricsToken` **admin scope**. POST 응답 `{ id, token }`(평문 1회) |
| `route/metrics/query.ts` | HTTP 경계 — `createMetricsQueryRoute`. GET `/devices`·`/logs`(`paginatedResponse`)·`/series`, 전부 admin scope. series 는 디바이스 미존재 시 404 |
| `service/domain/metrics/token.ts` | 도메인 로직 — `createMetricsTokenService`(create·validate·checkRateLimit·revoke·listAll), `MetricsTokenServiceDb`. 토큰은 `hashToken`(sha256) 저장, `expiresInDays`→`expiresAt`, validate 시 폐기·만료면 null·`lastUsedAt` fire-and-forget 갱신. rate limit = rolling 24h Mongo 이벤트 수 < `dailyLimit` |
| `service/domain/metrics/log.ts` | 도메인 로직 — `createMetricsLogService`(ingest·list·listDevices·getDevice·series), `MetricsLogServiceDb`. online 판정 = `now - lastSeenAt < max(3×intervalSec, 5분)`. ingest 는 `receivedAt` 서버시각 + 디바이스별 최신 이벤트로 upsert |
| `dto/metrics/token.ts` | Zod — `METRICS_TOKEN_SCOPE`(client/admin), `metricsTokenCreateSchema`(alias 1~100·scope enum def client·expiresInDays 1~3650 opt·dailyLimit opt), `metricsTokenResponseSchema` |
| `dto/metrics/ingest.ts` | Zod — `METRICS_PAYLOAD_MAX_BYTES`(65536)·`METRICS_BATCH_MAX`(50), `metricsIngestSchema`(deviceId 1~64 필수·메타 opt·intervalSec opt·payload record), `metricsIngestBatchSchema`(events min 1) |
| `dto/metrics/query.ts` | Zod — `metricsLogListQuerySchema`(deviceId/tokenId/from/to/limit≤200 def50/offset), `metricsSeriesQuerySchema`(deviceId 필수·field dot-path regex·from/to·limit≤2000 def500), 응답 스키마 2종 |
| `compose/metrics.ts` | DI — `composeMetrics`가 `MONGODB_URI` 없으면 `{}` 반환. `tokenDb` 는 Drizzle(단 `countEventsSince` 는 Mongo 카운트), `logDb` 는 Mongo 구현 |
| `compose/types.ts` | `ComposeMetricsArgs = ComposeCoreArgs`(`{ db, env }`) |
| `compose/index.ts` | `const metrics = composeMetrics(core)` + return 객체에 `...metrics` 스프레드 병합 |
| `middleware/require-metrics-token.ts` | 토큰 인증 — `Authorization: Bearer` 또는 `X-Metrics-Token` 헤더. validate 실패 401, admin 요구인데 client 토큰이면 403, `checkRateLimit:true` 옵션 시 429. 통과 시 `metricsTokenId`/`metricsTokenAlias` 컨텍스트 세팅 |
| `db/schema.ts` | `metrics_token`(`MetricsToken`/`NewMetricsToken`) 테이블 정의 |
| `db/mongo.ts` | `mongodb` v6 싱글턴 `getMongo(uri)`(+`closeMongo`), `MetricsLogDoc`·`MetricsDeviceDoc`, 컬렉션·인덱스 보장 |
| `route/index.ts` | `/metrics/ingest`·`/metrics/tokens`·`/metrics`(query)로 마운트(`stub` 래핑, 더 구체적인 접두사 먼저) |
| `page/admin/pages/metrics.tsx` | 어드민 SSR — 토큰 목록/발급/폐기(`/admin/metrics/tokens`). 미구성 시 안내 렌더 |
| `lib/error-code.ts` · `lib/error-message.ts` · `lib/error.ts` | `METRICS_TOKEN_INVALID`(401)·`METRICS_TOKEN_FORBIDDEN`(403)·`METRICS_TOKEN_NOT_FOUND`(404)·`METRICS_TOKEN_RATE_LIMIT`(429)·`METRICS_PAYLOAD_TOO_LARGE`(413)·`METRICS_BATCH_TOO_LARGE`(413)·`METRICS_DEVICE_NOT_FOUND`(404)·`METRICS_INGEST_FAILED`(500) 코드·메시지·상태 |

## API 엔드포인트

`route/index.ts`에서 `/metrics/ingest`·`/metrics/tokens`·`/metrics`로 마운트되고, `index.ts`에서 라우터 전체가 `/api`로 마운트된다. 인증 표기 `metrics-token(client|admin)` = `requireMetricsToken`(Bearer/`X-Metrics-Token`).

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| POST | `/api/metrics/ingest` | metrics-token(client)+rate limit | 단건 수집. payload 직렬화 64KB 초과 시 413 `METRICS_PAYLOAD_TOO_LARGE`. 응답 `{ count }` |
| POST | `/api/metrics/ingest/batch` | metrics-token(client)+rate limit | 배치 수집(events 1~50, 50 초과 413 `METRICS_BATCH_TOO_LARGE`). 응답 `{ count }` |
| GET | `/api/metrics/tokens` | metrics-token(admin) | 토큰 목록 조회 |
| POST | `/api/metrics/tokens` | metrics-token(admin) | 토큰 발급. 평문 토큰은 응답 `{ id, token }`로 1회만 반환 |
| DELETE | `/api/metrics/tokens/:id` | metrics-token(admin) | 토큰 폐기(`revoked_at` 기록). 없으면 404 `METRICS_TOKEN_NOT_FOUND` |
| GET | `/api/metrics/devices` | metrics-token(admin) | 디바이스 목록(각 행 `online` 계산 포함) |
| GET | `/api/metrics/logs` | metrics-token(admin) | 수집 로그 목록/필터(deviceId·tokenId·from·to·limit·offset). `paginatedResponse` |
| GET | `/api/metrics/series` | metrics-token(admin) | payload 수치 필드 시계열. 디바이스 미존재 시 404 `METRICS_DEVICE_NOT_FOUND` |

## 핵심 흐름

- **수집**: 클라이언트가 `Authorization: Bearer <token>` 또는 `X-Metrics-Token` 으로 POST `/api/metrics/ingest`(단건)·`/api/metrics/ingest/batch`(≤50) → `requireMetricsToken`(client scope 검증 + rolling 24h rate limit) → payload 크기 검사(직렬화 >64KB 413) → `metricsLogService.ingest` 가 `receivedAt` 서버시각으로 `metrics_logs` insert + 디바이스별 최신 이벤트로 `metrics_devices` upsert.
- **디바이스 메타 보존**: `upsertDevice` 는 null 메타를 `$set` 이 아니라 `$setOnInsert` 로 보내 **기존 메타를 null 로 덮지 않는다**(간헐적으로 메타 없는 이벤트가 와도 최초 등록값 유지).
- **조회·시계열**: admin scope 토큰으로 GET `/api/metrics/devices`(online = `now-lastSeenAt < max(3×intervalSec, 5분)`), `/api/metrics/logs`(페이지네이션), `/api/metrics/series`(aggregate: `payload.<field>` 가 number 인 문서만 → 최신순 limit → `{t,v}` 매핑 후 시간 오름차순 reverse).
- **토큰 발급·폐기**: 최초 admin 토큰은 `/admin/metrics/tokens` SSR 에서 발급하고, 이후 API(`/api/metrics/tokens`)로도 admin scope 로 발급/폐기한다. 평문 토큰은 발급 응답 1회만 노출된다(sha256 해시 저장).

## 주의사항 / 함정

- **`mongodb` 는 v6(6.20.x)에 고정**(`package.json`). `mongodb` 7.x 의 bson 이 Bun 1.3.0 미구현 `node:v8` `startupSnapshot.isBuildingSnapshot` 을 호출해 **모듈 로드 자체가 크래시**(`NotImplementedError`)한다. v6 은 핑·인덱스 생성이 정상 동작함을 실검증했다. 업그레이드 전 반드시 Bun 지원 여부를 확인한다.
- **MongoDB DB 명은 코드 상수 `metrics` 로 고정**이라 `MONGODB_URI` 의 path 세그먼트는 무시된다(`db/mongo.ts` `MONGO_DB_NAME`).
- **rate limit 카운트는 MySQL 이 아니라 Mongo 기준**: `MetricsTokenServiceDb.countEventsSince` 만 `compose/metrics.ts` 에서 `mongo.logs.countDocuments` 로 구현된다(나머지 token DB 는 Drizzle). 토큰 메타와 카운트 소스가 저장소를 넘나든다.
- **다운 푸시 알림 없음(의도)**: 온라인/오프라인은 `/api/metrics/devices` 조회 시점에만 계산된다. 디바이스가 죽어도 서버가 능동적으로 알리지 않는다 — 하트비트 감시 크론+Discord 알림은 사용자 결정으로 제거됐다(2026-07-22, `docs/PROCESS.md` 참조). 재도입 시 과거 구현은 커밋 `1eed4af` 의 `route/metrics/heartbeat.ts`·`checkHeartbeats` 를 참고한다.

## 관련 문서

- [../metrics-client-contract.md](../metrics-client-contract.md) — 클라이언트(machboard 에이전트·ESP32) 수집 계약(헤더·필드·제약·재시도·온라인 판정) 정본.
- [../reference/db-schema.md](../reference/db-schema.md) §metrics — `metrics_token` 테이블 + MongoDB 컬렉션 인벤토리.
- [../reference/api-endpoints.md](../reference/api-endpoints.md) §metrics — 전 라우트 평면 인벤토리.
- [../reference/env.md](../reference/env.md) — `MONGODB_URI`.
- [../admin-features.md](../admin-features.md) §5.5 Metrics Tokens(`/admin/metrics/tokens`) — 어드민 SSR 토큰 발급/폐기 화면.
- [../guidelines/add-domain.md](../guidelines/add-domain.md) — 신규 도메인 추가 절차(이 도메인이 하이브리드 저장소·graceful 비활성의 실례).
