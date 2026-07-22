# lib/ 유틸리티 전수 인벤토리

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 다루는 코드: `lib/api-response.ts`, `lib/db-helper.ts`, `lib/discord.ts`, `lib/env.ts`, `lib/error-code.ts`, `lib/error-message.ts`, `lib/error.ts`, `lib/external-api.ts`, `lib/hmac-state.ts`, `lib/credential-crypto.ts`, `lib/hono-types.ts`, `lib/ics-parser.ts`, `lib/ics.ts`, `lib/jwt-decode.ts`, `lib/log-service-name.ts`, `lib/mail-thread.ts`, `lib/mail-utils.ts`, `lib/pagination.ts`, `lib/privacy-policy.ts`, `lib/rate-limit.ts`, `lib/sensitive-filter.ts`, `lib/sentry.ts`, `lib/sql-utils.ts`, `lib/tailwind-converter.ts`, `lib/terms-of-service.ts`, `lib/token-utils.ts`, `lib/url-validator.ts`, `lib/with-auth.ts`, `lib/with-error-handling.ts`, `lib/with-rate-limit.ts`, `lib/with-spotify-auth.ts`, `lib/xml.ts`, `tests/lib/`

`lib/` 은 도메인·HTTP 프레임워크와 무관한 순수 유틸리티 + 횡단 코어(에러 체계·응답 헬퍼·HOF)를 모으는 레이어다. `lib/` 안에는 배럴(`index.ts`)이 없고 모든 소비자는 파일을 **직접 상대경로 import** 한다. 파일 34개, 대응 테스트는 `tests/lib/` 28개(`cron-auth.ts` 는 라우트 테스트에서 커버).

이 문서는 **"무엇이 이미 있는지"의 인벤토리**만 소유한다. 사용 패턴(에러 throw·응답 봉투·HOF 합성 규칙)은 [../architecture.md](../architecture.md) 와 [../hono-reference.md](../hono-reference.md) 가 소유하므로 여기서 재서술하지 않고 링크한다. 환경변수 전수 목록은 [env.md](./env.md), 공유 서비스는 [shared-services.md](./shared-services.md), 엔드포인트는 [api-endpoints.md](./api-endpoints.md) 가 소유한다.

---

## 중복 구현 금지 (이 문서의 목적)

> **새 유틸을 만들기 전에 반드시 이 인벤토리에서 기존 것을 먼저 찾는다.** 이름·역할이 겹치는 함수를 도메인/서비스에 새로 만들지 않는다. `lib/` 에 없으면 그때 `lib/` 에 추가하고 이 문서 표에 1행을 더한다.

코드 검증 중 확인된 **현존 중복·미사용**(정리하거나 재사용해야 할 대상):

- `lib/external-api.ts`(`fetchWithRetry`) — 비-test 코드에서 import 없음. `service/domain/weather/kma-api.ts` 가 동명 `fetchWithRetry` 를 **로컬로 재구현**(별개 시그니처)해서 쓴다. 새 외부 API 호출은 이 중복을 먼저 정리/통합할지 판단한다.
- `lib/pagination.ts`(`paginationQuerySchema` 등) — 비-test 코드에서 import 없음. `dto/common.ts` 에 **바이트 동일한** `paginationQuerySchema` 가 따로 정의돼 있다.
- `lib/db-helper.ts`(`batchInsert`, `chunkArray`) — 비-test 코드에서 import 없음(테스트 전용).
- `lib/sensitive-filter.ts`(`isSensitiveKey`, `filterSensitiveData`) — 비-test 코드에서 import 없음(테스트 전용).

위 4개는 `tests/lib/` 테스트만 존재하고 런타임 경로에서 안 쓰인다. 유사 기능이 필요하면 새로 만들지 말고 이 파일들을 재사용하거나 중복을 통합한다.

---

## 인벤토리 (파일당 1행)

| 파일 | 주요 export | 역할 | 주 사용처 (Grep 근거) | 테스트 |
|------|-------------|------|------------------------|--------|
| `lib/api-response.ts` | `successResponse`, `paginatedResponse`, `errorResponse` + 동명 `*Schema` | 응답 봉투 3종 + OpenAPI용 Zod 스키마 | 거의 모든 `route/*` + `middleware/error-handler.ts` | `api-response.test.ts` |
| `lib/error-code.ts` | `ERROR_CODE`, `ErrorCode` | 에러 코드 상수 109종 + union 타입 | `dto/error-response.ts`, `middleware/log-capture.ts`, `route/weather/*` | `error-code.test.ts` |
| `lib/error-message.ts` | `ERROR_MESSAGE` | 코드→한국어 메시지 `Record<ErrorCode,string>` | `dto/error-response.ts`, `middleware/{error-handler,log-capture}.ts` | (전용 없음; error-code·error 테스트가 커버) |
| `lib/error.ts` | `createAppError`, `isAppError`, `getStatusCode`, `AppError` | 코드→상태 매핑 + 에러 팩토리·가드 | 광범위: `route/*`, `service/domain/*`, `service/shared/*`, `middleware/*` | `error.test.ts` |
| `lib/with-error-handling.ts` | `withErrorHandling` | 핸들러 try/catch → AppError/500 변환 HOF | 사실상 모든 `route/*` 핸들러 | `with-error-handling.test.ts` |
| `lib/with-auth.ts` | `withAuth`, `withAdmin`, `withApiToken` | 세션/관리자/API토큰 인증 HOF | `route/{ai,auth,logs,mail,spotify,weather}/*` | `with-auth.test.ts` |
| `lib/with-rate-limit.ts` | `withRateLimit` | 사용자 id 기준 레이트리밋 HOF (auth 뒤에 합성, `pathKey?` 로 버킷 고정) | `route/mail/{message,sync}.ts`, `route/ai/{chat,attachment}.ts` | `with-rate-limit.test.ts` |
| `lib/with-spotify-auth.ts` | `withSpotifyAuth` | Spotify 위젯키 or 세션+accountId 인증 HOF | `route/spotify/data.ts` | `with-spotify-auth.test.ts` |
| `lib/cron-auth.ts` | `verifyCronAuth` | `Authorization: Bearer`/`x-cron-secret` == secret 검증(실패 시 `UNAUTHORIZED`). cron 엔드포인트 공용 | `route/drive/lifecycle.ts`, `route/metrics/archive.ts` | `tests/route/metrics/archive.test.ts` |
| `lib/hono-types.ts` | `HonoVariables`, `AuthContext` | Hono `c.set/get` 변수 계약(user·errorCode·errorDetail) | `index.ts`, `middleware/index.ts`, 다수 `route/*` | (타입 전용) |
| `lib/env.ts` | `getEnv`, `resetEnvCache`, `Env` | Zod `safeParse` 캐시 env 접근자 | `compose/index.ts`, `compose/types.ts` | `env.test.ts` |
| `lib/sentry.ts` | `initSentry`, `captureException` | `@sentry/bun` 지연 초기화·예외 캡처(가드) | `middleware/*`, `compose/{logs,ai}.ts`, 도메인 키 서비스 | `sentry.test.ts` |
| `lib/discord.ts` | `sendDiscordAlert` | 에러 알림 Discord 웹훅 POST | `compose/logs.ts` | (없음) |
| `lib/log-service-name.ts` | `serviceNameFromPath`, `severityFromStatus`, `errorCodeFromStatus` | 요청 경로/상태 → 로그 서비스명·심각도·코드 | `middleware/log-capture.ts` | `log-service-name.test.ts` |
| `lib/mask-sensitive-path.ts` | `maskSensitivePath` | 로그 캡처용 URL 토큰 세그먼트 마스킹(`/caldav/`·`/api/spotify/playing/`·`/api/calendar/` 토큰 경로 → `[REDACTED]`, calendar 비-토큰 세그먼트 events/groups/subscription 은 보존) | `middleware/log-capture.ts` | `mask-sensitive-path.test.ts` |
| `lib/hmac-state.ts` | `createOAuthState`, `verifyOAuthState`, `parseStatePayload`, `hmacSign/Verify`, `base64url*` | HMAC 서명 OAuth state + base64url | `service/domain/{mail,spotify}/*-oauth-connect.ts` | `hmac-state.test.ts` |
| `lib/token-utils.ts` | `generateToken`, `hashToken` | 32바이트 랜덤 토큰 생성 + SHA-256 해시 | `service/domain/{logs,spotify,weather}/*`, `service/shared/api-token.ts` | `token-utils.test.ts` |
| `lib/credential-crypto.ts` | `createCredentialCrypto` | AES-256-GCM(v2 scrypt) 자격증명 암복호화(공용) | `service/domain/mail/mail-crypto.ts`(위임), `compose/ai.ts` | `credential-crypto.test.ts` |
| `lib/jwt-decode.ts` | `decodeJwtPayloadUnverified`, `getJwtExpiryMs` | **서명 미검증** JWT payload 디코드 + exp 추출(codex 토큰 만료·account_id 판단) | `service/domain/ai/ai-provider-factory.ts` | `jwt-decode.test.ts` |
| `lib/url-validator.ts` | `isPublicUrl`, `isAllowedRedirect` | SSRF 가드(https·사설IP 차단) + 오픈리다이렉트 가드 | `route/{mail,spotify}/account.ts`, `service/*-oauth-connect.ts`, `service/shared/icon-loader.ts` | `url-validator.test.ts` |
| `lib/rate-limit.ts` | `createRateLimiter` | 인메모리 Map 고정 윈도우 리미터 | `compose/{ai,mail}.ts` | `rate-limit.test.ts` |
| `lib/sql-utils.ts` | `escapeLikePattern` | `LIKE` 와일드카드(`% _ \`) 이스케이프 | `compose/blog.ts`, `compose/mail.ts` | `sql-utils.test.ts` |
| `lib/mail-utils.ts` | `deriveThreadId`, `extractMessageIdTokens`, `encodeMimeWord`, `formatMailAddress`, `isBlockedHost`, `maskProviderError`, `sanitizeFilename`, `escapeHtml`, `sanitizeHeaderValue`, `sanitizeEmailName` | 메일 헤더/주소/파일명 sanitize·MIME 인코딩·SSRF 호스트 차단 | `dto/mail/account.ts`, `route/mail/message.ts`, `service/domain/{mail,ai}/*`, `service/domain/drive/drive-asset.ts` | `mail-utils.test.ts` |
| `lib/mail-thread.ts` | `computeThreadIds` | union-find 로 메시지 배치→threadId 그룹핑 | `scripts/backfill-thread-id.ts` | `mail-thread.test.ts` |
| `lib/ics-parser.ts` | `parseICS`, `extractUidFromICS`, `ParsedICS` | 인바운드 ICS(VEVENT) 파싱 | `route/calendar/caldav.ts` | `ics-parser.test.ts` |
| `lib/ics.ts` | `eventsToICS`, `getRecurrenceOccurrences`, `generateIcsUid`, `generateSubscriptionToken`, `generateTimezoneComponent` | 아웃바운드 ICS 생성 + `rrule` 반복 전개 | `route/calendar/{caldav,ics}.ts`, `service/domain/calendar/calendar.ts` | `ics.test.ts` |
| `lib/xml.ts` | `buildMultistatus`, `parsePropfind`, `parseReport`, `buildCalendarDataResponse` | CalDAV XML 빌드/파싱(`fast-xml-parser`) | `route/calendar/caldav.ts` | `xml.test.ts` |
| `lib/tailwind-converter.ts` | `convertTailwindToCSS`, `mergeStyles` | Tailwind 클래스→CSS 객체(`tw-to-css`) + 스타일 병합 | `compose/shared.ts` (배지) | `tailwind-converter.test.ts` |
| `lib/pagination.ts` | `paginationQuerySchema`, `calcOffset`, `calcTotalPages`, `buildPagination` | 페이지네이션 스키마·계산 헬퍼 | (비-test 미사용 — 중복: `dto/common.ts`) | `pagination.test.ts` |
| `lib/external-api.ts` | `fetchWithRetry`, `fetchBatch` | 재시도·타임아웃 fetch, 배치 fetch | (비-test 미사용 — weather 로컬 재구현) | `external-api.test.ts` |
| `lib/db-helper.ts` | `batchInsert`, `chunkArray` | 배열 배치 삽입·청크 분할 | (비-test 미사용) | `db-helper.test.ts` |
| `lib/sensitive-filter.ts` | `isSensitiveKey`, `filterSensitiveData` | 민감 키 값 `[REDACTED]` 마스킹 | (비-test 미사용) | `sensitive-filter.test.ts` |
| `lib/privacy-policy.ts` | `PRIVACY_POLICY` | 개인정보처리방침 정적 콘텐츠 상수 | `page/policy.tsx` | `tests/page/policy.test.ts` |
| `lib/terms-of-service.ts` | `TERMS_OF_SERVICE` | 이용약관 정적 콘텐츠 상수 | `page/policy.tsx` | `tests/page/policy.test.ts` |

---

## 에러 3파일 세트 (`error-code` · `error-message` · `error`)

에러는 세 파일로 분리 관리한다. 새 에러는 **세 파일 모두**에 추가한다(코드·메시지·상태). `throw createAppError('CODE')` 만 쓰고 `new Error` 직접 throw 는 금지(전역 계약 → [../memory/stack-and-invariants.md](../memory/stack-and-invariants.md)).

- `lib/error-code.ts` — `ERROR_CODE` 상수 객체(**109종**) + `ErrorCode = (typeof ERROR_CODE)[keyof …]` union.
- `lib/error-message.ts` — `ERROR_MESSAGE: Record<ErrorCode, string>`(한국어). 타입이 `Record<ErrorCode,…>` 라 코드 109종과 **1:1 강제**(109개 확인).
- `lib/error.ts` — `AppError` 타입, `STATUS_MAP`(코드→HTTP), `getStatusCode`, `createAppError`, `isAppError`.
  - `createAppError(code, details?)` = `{ code, message: ERROR_MESSAGE[code], statusCode: getStatusCode(code), details }`.
  - `isAppError` = `code`·`message`·`statusCode` 프로퍼티 유무로 판별(덕 타이핑).
  - `getStatusCode(code) = STATUS_MAP[code] ?? 500`.

### 도메인별 에러코드 prefix 규칙

| prefix | 도메인/범주 | 개수 | 예시 |
|--------|-------------|:----:|------|
| (없음) 제네릭 HTTP | 공통 | 7 | `VALIDATION_ERROR`(400), `NOT_FOUND`(404), `UNAUTHORIZED`(401), `FORBIDDEN`(403), `RATE_LIMIT_EXCEEDED`(429), `INTERNAL_ERROR`(500), `EXTERNAL_API_ERROR`(502) |
| (없음) 공유 인프라 | storage·image·auth·notify | 11 | `STORAGE_UPLOAD_FAILED`, `IMAGE_GENERATE_FAILED`, `FONT_NOT_FOUND`, `ICON_LOAD_FAILED`, `API_TOKEN_INVALID`, `SERVICE_NOT_CONFIGURED`, `AI_SUMMARIZE_FAILED` 등 |
| `BADGE_` | 배지 | 2 | `BADGE_INVALID_DIMENSIONS`, `BADGE_INVALID_COLOR` |
| `BLOG_` | 블로그 | 5 | `BLOG_POST_NOT_FOUND`, `BLOG_IMAGE_TOO_LARGE`(413) |
| `WEATHER_` | 날씨 | 5 | `WEATHER_KMA_API_ERROR`(502), `WEATHER_KEY_RATE_LIMIT`(429) |
| `MAIL_` | 메일 | 20 | `MAIL_ACCOUNT_NOT_FOUND`, `MAIL_SYNC_IN_PROGRESS`(409), `MAIL_OAUTH_STATE_INVALID` |
| `SPOTIFY_` | 스포티파이 | 8 | `SPOTIFY_KEY_INVALID`(401), `SPOTIFY_WIDGET_TOKEN_INACTIVE`(403) |
| `RESUME_` | 이력서 | 1 | `RESUME_NOT_FOUND` |
| `CALENDAR_` | 캘린더/CalDAV | 8 | `CALENDAR_CALDAV_AUTH_FAILED`(401), `CALENDAR_GROUP_HAS_EVENTS`(409) |
| `DRIVE_` | 드라이브 | 14 | `DRIVE_QUOTA_EXCEEDED`(413), `DRIVE_L2_UPLOAD_FAILED`, `DRIVE_ALL_TIERS_FAILED` |
| `LOG_` | 로그 수집 | 5 | `LOG_BATCH_TOO_LARGE`(413), `LOG_DEVICE_KEY_RATE_LIMIT`(429) |
| `METRICS_` | metrics 수집 | 8 | `METRICS_TOKEN_INVALID`(401), `METRICS_TOKEN_FORBIDDEN`(403), `METRICS_TOKEN_RATE_LIMIT`(429), `METRICS_PAYLOAD_TOO_LARGE`(413), `METRICS_BATCH_TOO_LARGE`(413), `METRICS_INGEST_FAILED`(500) |
| `AI_` | AI 프로바이더 | 15 | `AI_REAUTH_REQUIRED`(401), `AI_CREDENTIALS_INVALID`(401), `AI_COMPLETION_FAILED`(502), `AI_ATTACHMENT_TOO_LARGE`(413) |

- 도메인 코드는 **도메인 접두사**로 네이밍. 새 도메인 에러는 그 도메인 prefix 를 붙인다.
- **STATUS_MAP 누락 3종**: `MAIL_UPLOAD_BLOCKED_EXTENSION`·`MAIL_BLOCKED_HOST`·`MAIL_OAUTH_ACCOUNT_MISMATCH` 는 `ERROR_CODE`/`ERROR_MESSAGE`(109)에는 있으나 `STATUS_MAP`(106)에는 없어 `getStatusCode` 의 `?? 500` fallback 으로 **500** 이 된다(metrics 8종은 세 파일 모두 등록됨). `STATUS_MAP` 은 `Record<string, number>`(≠`Record<ErrorCode,…>`)라 컴파일러가 누락을 못 잡는다. 새 코드 추가 시 세 파일 정합을 수동 확인한다.

---

## 파일별 상세

### 응답·에러 코어

**`lib/api-response.ts`**
- export: `successResponse(data)` → `{ success:true, data }`, `paginatedResponse(data, {page,limit,total})` → `totalPages` 를 `Math.ceil(total/limit)` 로 자동 계산해 부착, `errorResponse(code,message,details?)`. + OpenAPI용 `successResponseSchema`/`paginatedResponseSchema`/`errorResponseSchema`.
- `errorResponse` 의 `details` 는 **`NODE_ENV !== 'production'` 일 때만** 직렬화(정보 노출 방지).
- 사용처: 거의 모든 `route/*` + `middleware/error-handler.ts`. 테스트: `tests/lib/api-response.test.ts`.

**에러 3파일** — 위 [에러 3파일 세트](#에러-3파일-세트-error-code--error-message--error) 참조. 테스트: `error-code.test.ts`, `error.test.ts`(`error-message` 는 이 둘이 간접 커버).

### HTTP HOF (`with-*`)

**`lib/with-error-handling.ts`**
- `withErrorHandling(handler)`: `isAppError` 면 `c.set('errorCode', …)` 후 `errorResponse(...)` 를 해당 `statusCode` 로, 아니면 `c.set('errorDetail', …)` + (dev) `console.error` + `captureException` 후 `INTERNAL_ERROR`(500).
- `c.set('errorCode'/'errorDetail')` 는 [../logging.md](../logging.md) 의 로그 캡처가 읽는다. 사용처: 사실상 전 `route/*`. 테스트: `with-error-handling.test.ts`.

**`lib/with-auth.ts`**
- `withAuth`(세션 필수), `withAdmin`(추가로 `user.role === 'admin'`), `withApiToken`(`X-API-Token` 헤더 → `validateToken`). 인증 성공 시 `handler(c, user)` 로 user 주입.
- 사용처: `route/{ai,auth,logs,mail,spotify,weather}/*`. 테스트: `with-auth.test.ts`.

**`lib/with-rate-limit.ts`**
- `withRateLimit`: `(c, user)` 를 받는 핸들러를 감싸 `checkLimit(user.id, pathKey ?? c.req.path)` → `X-RateLimit-Limit/Remaining/Reset` 헤더 부착, 초과 시 `RATE_LIMIT_EXCEEDED`. **user 를 받으므로 auth HOF 뒤에 합성**해야 한다. `deps.pathKey` 로 버킷 키를 경로 대신 고정(AI 라우트가 `ai:attachment:upload` 등 액션별 버킷 지정에 사용). 사용처: `route/mail/{message,sync}.ts`, `route/ai/{chat,attachment}.ts`. 테스트: `with-rate-limit.test.ts`.

**`lib/with-spotify-auth.ts`**
- `withSpotifyAuth`: `X-Spotify-Key` 헤더가 있으면 위젯키 검증, 없으면 세션 + `accountId` 쿼리 검증(양수 정수) 후 `spotifyAccountService.getById` 로 소유권 확인. `SpotifyAuthResult{spotifyAccountId,userId}` 주입.
- **lib→service 타입 참조**: 이 파일은 예외적으로 `service/domain/spotify/*` 의 서비스 타입을 `import type` 한다(런타임 의존은 `SpotifyAuthDeps` DI 주입). 사용처: `route/spotify/data.ts`. 테스트: `with-spotify-auth.test.ts`.

### 인증·보안 유틸

**`lib/hmac-state.ts`**
- OAuth CSRF state 를 HMAC-SHA256 으로 서명/검증. `createOAuthState(data,secret,ttlMs)` → `payload.sig`, `verifyOAuthState(state,secret)` 는 서명 + `exp` 만료를 검증(`timingSafeEqual`).
- `parseStatePayload` 는 **서명 검증 없이** payload 만 base64url 디코드(비신뢰 파싱 — 검증 필요 경로에 쓰지 말 것). `base64url`/`base64urlEncode`/`base64urlDecode`/`hmacSign`/`hmacVerify` 도 export.
- 사용처: `service/domain/{mail,spotify}/*-oauth-connect.ts`. 테스트: `hmac-state.test.ts`.

**`lib/token-utils.ts`**
- `generateToken()` = `crypto.getRandomValues` 32바이트 → hex(64자), `hashToken(t)` = SHA-256 hex. 도메인 키(디바이스·spotify api/widget·weather)와 API 토큰의 발급/저장 해시에 사용.
- 사용처: `service/domain/{logs,spotify,weather}/*`, `service/shared/api-token.ts`. 테스트: `token-utils.test.ts`.

**`lib/url-validator.ts`**
- `isPublicUrl(url)`: https 전용 + `localhost`/`0.0.0.0`/`[::1]` 및 사설·링크로컬 IP 대역(`10.`/`172.16-31.`/`192.168.`/`127.`/`169.254.`/`fc00:`/`fe80:` 등) 차단 → 원격 아이콘 fetch SSRF 방어.
- `isAllowedRedirect(url)`: 상대경로(`/`, `//` 제외) 또는 `gumyo.net`/`hyns.dev`(및 서브도메인)만 허용 → 오픈 리다이렉트 방어.
- 사용처: `route/{mail,spotify}/account.ts`, `service/*-oauth-connect.ts`, `service/shared/icon-loader.ts`. 테스트: `url-validator.test.ts`.

**`lib/rate-limit.ts`**
- `createRateLimiter({windowMs,maxRequests})` → `{checkLimit(key), reset(key)}`. **인메모리 `Map`** + `setInterval` 만료 청소. 서버리스/멀티인스턴스에서는 인스턴스별 독립(공유 안 됨). 사용처: `compose/mail.ts`(60초/20회, 키 `mail:{userId}:{path}`)·`compose/ai.ts`(60초/30회, 키 `ai:{userId}:{path}`) — 둘 다 `checkLimit` 어댑터로 `withRateLimit` 에 주입. 테스트: `rate-limit.test.ts`.

**`lib/sensitive-filter.ts`**
- `isSensitiveKey(key)`(password/token/secret/authorization 등 부분일치), `filterSensitiveData(obj)` → 값 `[REDACTED]`. **현재 비-test 미사용**. 테스트: `sensitive-filter.test.ts`.

### 메일

**`lib/mail-utils.ts`**
- 메일 전용 sanitize/포맷 묶음(export 10종). 주요: `deriveThreadId`(References→In-Reply-To→Message-ID 우선순위로 threadId 도출), `extractMessageIdTokens`(`<id>` 토큰 추출·정규화), `encodeMimeWord`/`formatMailAddress`(RFC 2047 헤더 인코딩), `isBlockedHost`(SSRF — 사설IP·`metadata.google.internal` 등 차단, IPv4-in-IPv6·8진/16진 옥텟 파싱 포함), `maskProviderError`(IP·내부 호스트 `[redacted]`), `sanitizeFilename`, `escapeHtml`, `sanitizeHeaderValue`, `sanitizeEmailName`.
- 사용처: `dto/mail/account.ts`, `route/mail/message.ts`, `service/domain/{mail,ai}/*`(양쪽 providers 포함 — AI 프로바이더/커넥션이 `maskProviderError`, AI 첨부가 `sanitizeFilename` 재사용), `service/domain/drive/drive-asset.ts`. 테스트: `mail-utils.test.ts`. `deriveThreadId` 배경 → [../bug/mail-imap-thread-id.md](../bug/mail-imap-thread-id.md).

**`lib/mail-thread.ts`**
- `computeThreadIds(messages)`: message-id/references/in-reply-to 토큰을 **union-find** 로 묶어 각 메시지의 threadId(그룹 최고령 메시지의 message-id)를 `Map<id,string>` 으로 반환. 단건 실시간 도출인 `deriveThreadId`(mail-utils)와 달리 **배치 백필용**.
- 사용처: `scripts/backfill-thread-id.ts`. 테스트: `mail-thread.test.ts`.

### 캘린더 / CalDAV

**`lib/ics-parser.ts`**
- `parseICS(ics)` → `ParsedICS | null`(라인 언폴딩, VEVENT 필드·`RRULE`·`EXDATE` 파싱, `UID`/`SUMMARY`/`DTSTART` 없으면 null, `DTEND` 없으면 종일 24h/일반 1h 보정), `extractUidFromICS`. 인바운드 전용. 사용처: `route/calendar/caldav.ts`. 테스트: `ics-parser.test.ts`.

**`lib/ics.ts`**
- 아웃바운드 생성: `eventsToICS(events,name,domain,tz)`(VCALENDAR 직렬화, CRLF), `getRecurrenceOccurrences`(`rrule` 라이브러리로 반복 전개), `generateIcsUid`(`…@b-calendar`), `generateSubscriptionToken`(32바이트 hex), `generateTimezoneComponent`. 사용처: `route/calendar/{caldav,ics}.ts`, `service/domain/calendar/calendar.ts`. 테스트: `ics.test.ts`.

**`lib/xml.ts`**
- CalDAV XML(`fast-xml-parser`): `buildMultistatus`, `buildCalendarDataResponse`(빌드), `parsePropfind`, `parseReport`(파싱 — `calendar-multiget`/`calendar-query`/`sync-collection`/`free-busy-query` 판별, 파싱 실패 시 안전 기본값). 사용처: `route/calendar/caldav.ts`. 테스트: `xml.test.ts`.

### 이미지 / 배지

**`lib/tailwind-converter.ts`**
- `convertTailwindToCSS(classes)` = `tw-to-css` 의 `twi()` → CSS 문자열 → camelCase 객체(실패 시 `{}`), `mergeStyles(...styles)` = `Object.assign`. 사용처: `compose/shared.ts`(배지). 상세 → [../domains/badge.md](../domains/badge.md). 테스트: `tailwind-converter.test.ts`.

### 인프라 / 관측

**`lib/env.ts`**
- `getEnv()`: `envSchema.safeParse(process.env)` 결과를 모듈 캐시(`cachedEnv`)에 저장, 실패 시 누락 키를 모아 throw. `resetEnvCache()`(테스트용), `Env = z.infer<…>`. **env 접근은 이 파일로 단일화**(직접 `process.env` 금지). 사용처: `compose/index.ts`, `compose/types.ts`.
- 주의: 스키마에 `R2_CUSTOM_DOMAIN` 과 오타형 `R2_CUSTOME_DOMAIN` 이 **둘 다** 정의돼 있다. 변수 전수 목록·의미는 [env.md](./env.md) 소유. 테스트: `env.test.ts`.

**`lib/sentry.ts`**
- `initSentry(dsn)`(모듈 플래그로 1회, `@sentry/bun` 지연 `require`, `tracesSampleRate: 0.1`), `captureException(error)`. 둘 다 try/catch 로 감싸 Sentry 미설치/미초기화여도 무해. 사용처: `middleware/{error-handler,log-capture,request-logger}.ts`, `compose/{logs,ai}.ts`, 도메인 키 서비스. 테스트: `sentry.test.ts`.

**`lib/discord.ts`**
- `sendDiscordAlert(webhookUrl, payload)`: 서비스·에러코드·severity(·device·설명)를 조합해 웹훅 POST(`content` 1900자 slice). 사용처: `compose/logs.ts`. 상세 → [../logging.md](../logging.md). 테스트: 없음.

**`lib/log-service-name.ts`**
- `serviceNameFromPath(path)`(경로→`b-hub-{도메인}`, `/api/ai` 포함 12분기 + `/api` 폴백 `b-hub-api`), `severityFromStatus(status)`(≥500→40, else 30), `errorCodeFromStatus(status)`(상태→라벨, 미매핑 5xx→`INTERNAL_ERROR`, 그 외→`HTTP_{status}`). 사용처: `middleware/log-capture.ts`. 상세 → [../logging.md](../logging.md). 테스트: `log-service-name.test.ts`.

**`lib/mask-sensitive-path.ts`**
- `maskSensitivePath(path)`: 로그 캡처 시 URL 경로의 토큰 세그먼트를 `[REDACTED]` 로 치환. `/api/spotify/playing/`·`/caldav/` 는 프리픽스 다음 첫 세그먼트를, `/api/calendar/` 는 첫 세그먼트가 비-토큰(`events`/`groups`/`subscription`)이 아닐 때만 마스킹(그 외 경로는 원본 유지). 사용처: `middleware/log-capture.ts`. 테스트: `mask-sensitive-path.test.ts`.

**`lib/hono-types.ts`**
- `HonoVariables`(`user`·`errorCode`·`errorDetail`), `AuthContext = { Variables: HonoVariables }`. `new Hono<AuthContext>()` 및 `c.get/set` 타입 계약. 내부 `AuthUser` = `{id,name,email,role,image}`. 사용처: `index.ts`, `middleware/index.ts`, 다수 `route/*`. 테스트: 타입 전용(없음).

**`lib/sql-utils.ts`**
- `escapeLikePattern(term)`: `\` `%` `_` 이스케이프 → `LIKE` 검색 인젝션/와일드카드 오작동 방지. 사용처: `compose/blog.ts`, `compose/mail.ts`. 테스트: `sql-utils.test.ts`.

### 미사용/중복 (테스트 전용)

**`lib/db-helper.ts`** — `batchInsert(items,inserter,size=100)`, `chunkArray(items,size)`. 비-test 미사용. 테스트: `db-helper.test.ts`.

**`lib/external-api.ts`** — `fetchWithRetry(url,opts)`(재시도 3·타임아웃 10s·선형 백오프 `retryDelay*attempt`), `fetchBatch(ids,fetcher,size=10,delay=100)`. 비-test 미사용(weather 로컬 재구현 존재). 테스트: `external-api.test.ts`.

**`lib/pagination.ts`** — `paginationQuerySchema`(page/limit), `calcOffset`, `calcTotalPages`, `buildPagination`. 비-test 미사용(`dto/common.ts` 에 동일 스키마 중복). 테스트: `pagination.test.ts`.

### 정적 콘텐츠

**`lib/privacy-policy.ts`** / **`lib/terms-of-service.ts`** — `PRIVACY_POLICY` / `TERMS_OF_SERVICE` 정적 콘텐츠 상수(`title`/`lastUpdated`/`sections`). 사용처: `page/policy.tsx`. 테스트: `tests/page/policy.test.ts`.

---

## 관련 문서

- 계층·compose·부트스트랩(에러/응답/HOF 사용 패턴): [../architecture.md](../architecture.md)
- 전역 불변 규칙(에러 3파일·응답 헬퍼·env 접근): [../memory/stack-and-invariants.md](../memory/stack-and-invariants.md)
- 로깅 시스템(`log-service-name`·`discord`·`sentry`·`with-error-handling` 연계): [../logging.md](../logging.md)
- 어드민 SSR 패턴: [../hono-reference.md](../hono-reference.md)
- 환경변수 전수: [env.md](./env.md) · 공유 서비스: [shared-services.md](./shared-services.md) · 엔드포인트: [api-endpoints.md](./api-endpoints.md)
- 배지 도메인(`tailwind-converter`·`url-validator` 소비): [../domains/badge.md](../domains/badge.md)
- 메일 threadId 배경: [../bug/mail-imap-thread-id.md](../bug/mail-imap-thread-id.md)
