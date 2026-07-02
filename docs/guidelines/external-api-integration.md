# 외부 API 연동 지침

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 다루는 코드: `lib/external-api.ts`, `lib/hmac-state.ts`, `lib/url-validator.ts`, `lib/token-utils.ts`, `service/domain/weather/kma-api.ts`, `service/domain/weather/mock-kma-api.ts`, `service/domain/weather/weather-api-key.ts`, `service/domain/spotify/spotify-provider.ts`, `service/domain/spotify/spotify-oauth-connect.ts`, `service/domain/spotify/spotify-api-key.ts`, `service/domain/mail/mail-oauth-connect.ts`, `service/domain/ai/ai-provider-factory.ts`, `service/domain/ai/providers/codex-provider.ts`, `service/domain/ai/providers/anthropic-provider.ts`, `service/domain/ai/providers/ollama-provider.ts`, `compose/weather.ts`, `compose/spotify.ts`, `compose/mail.ts`, `compose/ai.ts`, `route/weather/mock.ts`, `route/index.ts`, `lib/error-code.ts`, `lib/error.ts`, `service/shared/cache.ts`, `service/shared/redis-cache.ts`

## 개요

- 외부 HTTP API(기상청·Spotify·Google/Gmail 등)를 새로 연동하거나 기존 연동을 수정할 때 따르는 절차·패턴을 규정한다.
- 소유 범위: 외부 연동에 **공통으로 적용되는 규칙**(공유 fetch 헬퍼, API 키 관리, OAuth connect, mock, 캐시 선택, 에러 매핑). 각 도메인의 엔드포인트·스키마·세부 흐름은 도메인 문서가 소유한다 — [../domains/weather.md](../domains/weather.md) · [../domains/spotify.md](../domains/spotify.md) · [../domains/mail.md](../domains/mail.md) · [../domains/drive.md](../domains/drive.md) · [../domains/ai.md](../domains/ai.md).
- 계층 경계는 [../architecture.md](../architecture.md) 를 전제한다: 외부 SDK 인스턴스·OAuth 토큰·Drizzle 은 `compose/` 가 만들어 주입하고, `service/domain/` 은 주입된 인터페이스만 호출한다(HTTP·DB 구현을 모른다).

## 연동 지점 인벤토리

| 도메인 | 외부 대상 | 클라이언트 코드 | b-hub→외부 인증 | 캐시 | mock |
|--------|-----------|-----------------|-----------------|------|------|
| weather | KMA `VilageFcstInfoService_2.0` (`http://apis.data.go.kr/1360000/...`) | `service/domain/weather/kma-api.ts` | env 고정 `KMA_API_KEY`(쿼리 `serviceKey`) | `redisCache` | O (`mock-kma-api.ts`) |
| spotify | Spotify Web API (`https://api.spotify.com/v1`) + Accounts (`https://accounts.spotify.com`) | `service/domain/spotify/spotify-provider.ts`, `spotify-oauth-connect.ts` | OAuth(앱 자격 env `SPOTIFY_CLIENT_ID/SECRET`, 토큰 `account` 테이블) | `createCache`(앨범아트) | X |
| mail(gmail) | Google OAuth (`accounts.google.com`, `oauth2.googleapis.com`, `googleapis.com/oauth2/v3`) | `service/domain/mail/mail-oauth-connect.ts` | OAuth(앱 자격 env `GOOGLE_CLIENT_ID/SECRET`, 토큰 `account` 테이블) | — | X |
| drive(L3) | Google Drive v3 (`oauth2.googleapis.com`, `googleapis.com/drive/v3`) | `service/shared/gdrive-storage.ts` | OAuth refresh token(`account` 테이블) | — | X |
| ai | codex(`chatgpt.com/backend-api/codex`) · anthropic(`api.anthropic.com`) · ollama(`ollama.com`) | `service/domain/ai/providers/*`, `ai-provider-factory.ts` | codex=OAuth(access/refresh/id, 암호화 저장 `ai_providers`) · anthropic/ollama=API key(암호화 저장) | 모델목록 `ai_models` DB(도메인) | X |

- storage(R2/S3), 이미지·아이콘 원격 로드 등 SDK/파일 계열 외부 의존은 [../reference/shared-services.md](../reference/shared-services.md) 가 소유한다.

## 1. 공유 fetch 헬퍼 (`lib/external-api.ts`)

- `fetchWithRetry<T>(url, options?)` — 옵션 `maxRetries`(기본 3) / `retryDelay`(기본 1000ms) / `timeout`(기본 10000ms) / `headers`.
  - `AbortController` + `setTimeout` 으로 요청별 타임아웃. `!response.ok` 이면 `HTTP {status}: {statusText}` 를 throw 해 재시도로 넘긴다.
  - 백오프는 선형(`retryDelay * attempt`). 마지막 시도까지 실패하면 판별유니온 `{ success: false, error: string }` 반환(성공은 `{ success: true, data }`). **에러코드 매핑 없이 문자열 메시지만** 돌려준다.
  - 응답은 `response.json() as T` 로 강제 파싱한다(JSON 응답 전제).
- `fetchBatch<T>(ids, fetcher, batchSize = 10, batchDelay = 100)` — id 배열을 `batchSize` 청크로 잘라 `Promise.all` 로 병렬 처리하고 청크 사이에 `batchDelay` 지연. `(T | null)[]` 반환.
- **현재 배선 상태**: 프로덕션 소비처 없음 — 참조가 `tests/lib/external-api.test.ts` 에만 존재한다. weather/spotify 는 이 헬퍼를 쓰지 않고 각자 재시도 로직을 인라인 구현한다(`kma-api.ts` 내부의 동명 `fetchWithRetry` 클로저, `spotify-provider.ts` 의 `spotifyFetch`).
- 사용 규칙:
  - 새 외부 GET 연동이 **단순 재시도 + 타임아웃 + JSON 파싱**이면 이 헬퍼 재사용을 우선한다.
  - 아래가 필요하면 도메인 클라이언트에서 확장 구현한다(현 weather/spotify 가 그 예): (a) 응답 헤더 기반 백오프(예: 429 `Retry-After`), (b) OAuth 토큰 주입·401 갱신, (c) 프로바이더 결과코드 → 도메인 에러코드 매핑(§6).
  - 헬퍼는 실패를 문자열로만 반환하므로, 도메인 에러코드가 필요하면 호출부에서 매핑한다.

## 2. API 키 관리 패턴 2종

같은 "API 키"라도 호출 방향이 반대다. 방향에 따라 저장·주입 방식을 나눈다.

| 구분 | A. env 고정 상류 자격증명 | B. DB 저장·발급 하류 키 |
|------|---------------------------|--------------------------|
| 방향 | b-hub → 외부 프로바이더 | 외부 소비자(디바이스·사이트) → b-hub |
| 예 | `KMA_API_KEY`, `SPOTIFY_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET` | `weather_api_key`, `spotify_api_keys` 테이블 |
| 저장 | `.env` → `getEnv()`(`lib/env.ts`, 모두 `.optional()`) | MySQL, 해시(SHA-256)로만 |
| 주입 | compose 가 서비스에 주입(`?? ''` 폴백) | 미들웨어/HOF 가 요청 시 검증 |
| 개수 | 단일·공유 | 사용자당 다수 발급 |

- **A. env 고정 상류 자격증명**: b-hub 가 외부를 호출할 때 쓰는 단일 시크릿. `createKmaApiService({ apiKey: env.KMA_API_KEY ?? '' })`(`compose/weather.ts`) 가 대표 예이며, KMA 요청 쿼리 `serviceKey` 에 그대로 붙는다. OAuth 앱 자격(`SPOTIFY_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`)도 같은 부류다. 시크릿은 `getEnv()` 로만 접근하고 코드·로그에 노출하지 않는다. env 전수는 [../reference/env.md](../reference/env.md).
- **B. DB 저장·발급 하류 키**: b-hub 가 자기 API 소비자에게 발급하는 키. `create` 는 `generateToken()`(32바이트 랜덤 hex)을 만들어 **1회만 평문 반환**하고 `hashToken()`(SHA-256 hex)로 저장한다(`lib/token-utils.ts`). `validate(token)` 은 해시로 매칭 → `expiresAt` 확인 → `lastUsedAt` 갱신(fire-and-forget, 실패는 `captureException`). weather 는 추가로 `weather_api_log` + `dailyLimit` + `checkRateLimit` 로 24시간 창 요청 한도를 건다.
  - 검증 위치는 미들웨어/HOF 다: `middleware/require-weather-key.ts`(헤더 `X-Weather-Key`, 실패 `WEATHER_KEY_INVALID` / 한도초과 `WEATHER_KEY_RATE_LIMIT`), `lib/with-spotify-auth.ts`(헤더 `X-Spotify-Key`, 실패 `SPOTIFY_KEY_INVALID`). 상세는 도메인 문서.
- **변형 — OAuth access/refresh 토큰**: env 가 아니라 better-auth `account` 테이블(`providerId='google'|'spotify'`)에 저장·재사용한다. spotify 는 401 시 refresh 로 갱신 후 `account.accessToken/accessTokenExpiresAt` 를 업데이트한다(교환·업데이트는 `compose/spotify.ts` `refreshOAuthToken`, 동시 갱신 중복은 `spotify-provider.ts` 의 단일 비행 `refreshPromise` 로 방지). drive L3 는 `scope LIKE '%drive.file%'` 계정의 refresh token 을 읽는다 → [../reference/shared-services.md](../reference/shared-services.md). **AI codex** 는 OAuth 토큰(access/refresh/id)을 better-auth `account` 가 아니라 암호화해 `ai_providers` 테이블에 저장하고, accessToken JWT 만료 5분 전 자동 갱신 시 spotify 와 동일한 **단일 비행 락**(`providerId` 별 `refreshInFlight` Map, `ai-provider-factory.ts`)으로 동시 갱신 중복을 막는다. 갱신 실패는 `AI_REAUTH_REQUIRED` 로 재인증을 요구한다(`markReauthRequired`). anthropic·ollama 은 API key(암호화 저장)만 쓴다 → [../domains/ai.md](../domains/ai.md).

## 3. OAuth connect 패턴 (hmac-state)

mail·spotify 의 계정 연결은 **동일한 2단계 구조**를 공유한다(`mail-oauth-connect.ts`, `spotify-oauth-connect.ts`). 새 OAuth 연동도 이 구조를 그대로 따른다.

### 서명 state (`lib/hmac-state.ts`)

- `createOAuthState(data, secret, ttlMs)` = `base64url(JSON({ ...data, exp }))` + `.` + HMAC-SHA-256 서명(WebCrypto). `exp = Date.now() + ttlMs`.
- `verifyOAuthState<T>(state, secret)` = 첫 `.` 로 payload/서명 분리 → `hmacVerify`(길이 확인 후 `timingSafeEqual` 상수시간 비교) → payload 파싱 → `exp` 만료 확인. 실패 시 `Invalid state format` / `Invalid state signature` / `State expired` throw.
- `parseStatePayload<T>(state)` = **서명 검증 없이** payload 만 디코드(오류 시 `null`). 리다이렉트 추출 등 비보안 용도 한정 — 인가 판단에 쓰지 않는다.
- `secret` 은 양쪽 모두 `env.BETTER_AUTH_SECRET`(`compose/spotify.ts:76`, `compose/mail.ts:110`). `STATE_TTL_MS = 10분`.

### ① `generateAuthUrl(userId, baseUrl, redirect?)`

- `redirect` 는 `isAllowedRedirect`(`/` 로 시작하는 내부경로 또는 `gumyo.net`/`hyns.dev` 화이트리스트, `lib/url-validator.ts`)를 통과한 값만 state 에 담고 나머지는 `null`.
- `{ userId, redirect }` 를 서명 state 로 만들고 authorize URL 파라미터(`client_id`/`redirect_uri`/`response_type=code`/`scope`/`state`)를 조립한다.
- 프로바이더 차이:
  - mail(Google): scope `openid email profile gmail.modify gmail.send` + `access_type=offline` + `prompt=consent`.
  - spotify: scope `user-read-currently-playing user-read-playback-state playlist-read-private user-read-recently-played`. `access_type`/`prompt` 없음.

### ② `handleCallback(code, state, sessionUserId, baseUrl)`

- `verifyOAuthState` 실패 → `MAIL_OAUTH_STATE_INVALID` / `SPOTIFY_OAUTH_STATE_INVALID`.
- `stateData.userId !== sessionUserId` → 동일 STATE_INVALID(로그인 사용자와 연결 개시 사용자 바인딩 검증).
- 코드 교환: 토큰 URL 에 POST(`application/x-www-form-urlencoded`, `grant_type=authorization_code`, `redirect_uri` 에코). 클라이언트 인증 차이 — mail 은 `client_id`+`client_secret` 을 **body** 에, spotify 는 `Basic base64(client_id:client_secret)` **헤더**에 싣는다.
- `!ok` → `*_OAUTH_EXCHANGE_FAILED`(`{ detail: 응답 본문 }`). 이어 userinfo/profile 조회 후 `account` upsert(providerId) → 도메인 계정(`mail_accounts`/`spotify_accounts`) 생성·연결(`betterAuthAccountId`) → state 의 redirect 반환.
- 콜백 경로: mail `/api/mail/accounts/connect/google/callback`, spotify `/api/spotify/accounts/connect/callback`.

## 4. mock 제공 기준

- 사례: `service/domain/weather/mock-kma-api.ts` 의 `createMockKmaApiService(): KmaApiService`. 실서비스와 **동일 인터페이스**(`getUltraSrtNcst`/`getUltraSrtFcst`/`getVilageFcst`/`getFcstVersion`)를 구조적으로 구현하고, KMA 스키마 형태의 난수 데이터를 항상 `{ success: true }` 로 반환한다.
- 배선: 런타임 스위치가 아니다. **별도 라우트** `/weather/mock`(`route/index.ts:95`, `createWeatherMockRoute`)로 실 `/weather` 와 나란히 마운트하며, 동일한 키 미들웨어의 무로깅 변형(`requireWeatherKeyNoLog`)으로 보호한다.
- mock 라우트를 만드는 기준:
  - 외부 의존이 **쿼터·비용·레이트리밋**을 가져 개발·데모 중 실호출이 부담일 때.
  - **라이브 자격증명/데이터가 개발환경에 없어** 클라이언트·펌웨어를 독립적으로 개발해야 할 때.
  - 서비스 타입(`KmaApiService` 등 `ReturnType<typeof create...>`)이 고정돼 mock 이 **구조적으로 드롭인 대체** 가능할 때. mock 은 실서비스 타입을 그대로 구현(`: KmaApiService`)하고 동일한 결과 셰이프를 반환한다.
- OAuth·상태변경을 동반하는 연동(spotify/mail)은 부작용이 있어 mock 라우트를 두지 않는다(현재 없음). 이 경우 테스트에서 주입 인터페이스를 목킹한다.

## 5. 캐시 선택 (cache vs redis-cache)

정본 비교표는 [../reference/shared-services.md](../reference/shared-services.md) 의 "캐시 2종"이 소유한다. 외부 API 응답 캐싱 시 선택 규칙만 정리한다.

- 상류 응답을 **서버리스 인스턴스 간 공유·재시작 후 유지**하고 프로바이더 발행 스케줄에 TTL 을 맞춰야 하면 `redisCache`(싱글톤, 직접 import). weather/KMA 가 예로, TTL 을 다음 발행 시각까지 계산하고 Redis 실패 시 30초 인메모리로 폴백한다(`kma-api.ts` `cachedFetch`, `redis-cache.ts`).
- **인스턴스 로컬·타입지정·바운드 LRU** 로 충분한 파생/변환 값이면 `createCache`(compose 가 인스턴스화해 DI). spotify 앨범아트가 예(`maxSize 200`, `defaultTtlMs 5분`, `compose/spotify.ts:224`).

## 6. 에러 코드 매핑 규칙

외부 실패는 raw 에러·HTTP 상태를 그대로 노출하지 않고 **도메인 접두사 에러코드**로 매핑한다. 2계층으로 처리한다.

1. **외부 클라이언트 계층** — 실패를 판별유니온으로 반환하거나 도메인 에러를 직접 throw.
   - `kma-api.ts`: `{ success: false, error: { code, message } }`. 프로바이더 코드는 `mapKmaErrorCode(resultCode)` 로 매핑 — `'00'`=성공, `'03'` → `WEATHER_DATA_NOT_FOUND`, 그 외 전부 `WEATHER_KMA_API_ERROR`. HTTP/네트워크 실패도 `WEATHER_KMA_API_ERROR`.
   - `spotify-provider.ts`: 401/429 는 재시도로 흡수(429 는 `Retry-After` 존중, 최대 60초), 그 외 `!res.ok` 는 `throw createAppError('SPOTIFY_API_ERROR', { status })`.
2. **라우트 계층** — 판별유니온 결과를 도메인 에러로 승격: `if (!result.success) throw createAppError(result.error.code as ErrorCode, { detail: result.error.message })`(`route/weather/weather.ts`, `route/weather/mock.ts`).
- OAuth: 토큰/유저정보 교환 실패 → `*_OAUTH_EXCHANGE_FAILED`(`{ detail }` 첨부), state 검증 실패·사용자 불일치 → `*_OAUTH_STATE_INVALID`.
- 상태코드는 코드→상태 매핑(`lib/error.ts` `STATUS_MAP`)이 결정한다. 외부 연동 관련 코드:

| 에러코드 | 상태 | 의미 |
|----------|:----:|------|
| `EXTERNAL_API_ERROR` | 502 | 범용 외부 실패(레지스트리에 존재하나 프로덕션 throw 처 없음 — 테스트만) |
| `WEATHER_KMA_API_ERROR` | 502 | KMA 호출/네트워크 실패 |
| `WEATHER_DATA_NOT_FOUND` | 404 | KMA `resultCode '03'` |
| `WEATHER_KEY_INVALID` / `SPOTIFY_KEY_INVALID` | 401 | 하류 키 무효 |
| `WEATHER_KEY_RATE_LIMIT` | 429 | 일일 한도 초과 |
| `SPOTIFY_API_ERROR` | 502 | Spotify 호출 실패 |
| `MAIL_OAUTH_EXCHANGE_FAILED` / `SPOTIFY_OAUTH_EXCHANGE_FAILED` | 502 | 토큰 교환 실패 |
| `MAIL_OAUTH_STATE_INVALID` / `SPOTIFY_OAUTH_STATE_INVALID` | 400 | state 검증 실패 |

- 규칙: 새 외부 실패 유형은 범용 `EXTERNAL_API_ERROR` 로 뭉치지 말고 **도메인 접두사 코드**(`WEATHER_*`/`SPOTIFY_*`/`MAIL_*`/`AI_*`)를 우선한다. 신규 코드는 3파일(`lib/error-code.ts`·`lib/error-message.ts`·`lib/error.ts`)에 함께 추가한다 — 정본 절차는 [../reference/lib-utilities.md](../reference/lib-utilities.md).

## 7. 절차 체크리스트 + 검증

새 외부 API 를 연동할 때 순서대로 확인한다.

- [ ] **상류 자격증명**은 `.env` + `getEnv()`(`lib/env.ts`)로만. env 스키마에 키 추가, `?? ''` 폴백 여부 확인. 코드·로그 노출 금지.
- [ ] **하류 소비자 키**가 필요하면 DB 발급·해시저장(`generateToken`/`hashToken`) + 미들웨어 검증 패턴(§2 B)을 재사용. 테이블 정의는 [../reference/db-schema.md](../reference/db-schema.md).
- [ ] **외부 클라이언트**는 판별유니온 결과 또는 도메인 에러 throw 로 실패를 표면화. HTTP/네트워크 실패의 재시도·타임아웃 포함(단순하면 `lib/external-api.ts` 재사용).
- [ ] **에러 매핑**: 프로바이더 실패 → 도메인 접두사 에러코드(§6). 신규 코드는 3파일 등록.
- [ ] **OAuth** 면 hmac-state 서명 state + `userId` 바인딩 + redirect 화이트리스트 + 2단계(generate/callback) 구조(§3)를 따른다. `secret` 은 `BETTER_AUTH_SECRET`.
- [ ] **캐시**가 필요하면 redis vs createCache 기준으로 선택(§5).
- [ ] 개발·데모에 실호출이 부담이고 타입이 고정돼 있으면 **mock + 별도 라우트**(§4)를 검토.
- [ ] **계층 경계**: 외부 SDK 인스턴스·OAuth 토큰·Drizzle 은 `compose/` 에서 주입, `service/domain/` 은 순수 로직 유지.

검증:

- 타입: `bunx tsc --noEmit`.
- 테스트: `bun test <경로>`(예: `tests/lib/external-api.test.ts`, `tests/lib/hmac-state.test.ts`, 대상 도메인 테스트). 전체 테스트 지침은 [../testing.md](../testing.md).
- 엔드포인트 수기 검증 항목은 [../quality-assurance/endpoint-qa.md](../quality-assurance/endpoint-qa.md).
