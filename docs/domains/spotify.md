# Spotify 도메인

> 기준: 2026-09-07 (fix/audit-batch3-serverless @ 워킹트리 미커밋 변경) 코드 검증. 다루는 코드: `dto/spotify/*`, `route/spotify/*`, `service/domain/spotify/*`, `compose/spotify.ts`, `lib/rate-limit.ts`, `lib/with-spotify-auth.ts`, `lib/hmac-state.ts`, `lib/token-utils.ts`, `lib/url-validator.ts`, `service/shared/cache.ts`, `db/schema.ts`, `route/index.ts`, `index.ts`, `middleware/security-headers.ts`

## 개요

- 사용자가 자신의 Spotify 계정을 OAuth 로 연결하고, "현재 재생 중" 트랙과 플레이리스트를 조회하며, 외부 사이트에 임베드 가능한 "지금 듣는 곡" 위젯(SVG/HTML/JSON)을 공개 토큰으로 노출하는 도메인.
- 외부 의존: Spotify Web API(`https://api.spotify.com/v1`), Spotify Accounts(`https://accounts.spotify.com` — authorize/token). OAuth Authorization Code 그랜트로 토큰을 발급받고, 401 응답 시 refresh token 으로 재발급한다.
- 연결된 OAuth 토큰(access/refresh)은 별도 테이블이 아니라 better-auth 의 `account` 테이블에 `providerId='spotify'` 로 저장·재사용한다. `spotify_accounts` 는 `account.id`(better-auth 계정 id)를 `betterAuthAccountId` 로 참조해 토큰에 접근한다.
- 접근 인증은 3가지: (1) 관리용은 better-auth 세션, (2) 프로그램 접근용 API 키(`X-Spotify-Key` 헤더), (3) 공개 위젯용 위젯 토큰(URL 경로). API 키·위젯 토큰은 평문을 SHA-256 해시로 저장한다.

## 파일 맵

| 파일 | 역할 |
|------|------|
| `dto/spotify/account.ts` | 계정 수정/파라미터/응답 Zod 스키마 (`spotifyAccountUpdateSchema`, `spotifyAccountParamSchema`, `spotifyAccountResponseSchema`) |
| `dto/spotify/api-key.ts` | API 키 발급/응답 스키마 (`spotifyApiKeyCreateSchema`, `spotifyApiKeyResponseSchema`) |
| `dto/spotify/widget-token.ts` | 위젯 토큰 발급/토글/응답 스키마 |
| `dto/spotify/data.ts` | 플레이리스트 목록 쿼리 스키마 (`playlistsQuerySchema`, limit 1–50 기본 20 / offset≥0) |
| `route/spotify/account.ts` | 계정 목록·상세·수정·삭제 + OAuth `connect`/`connect/callback` (세션) |
| `route/spotify/key.ts` | API 키 목록·발급·삭제 (세션) |
| `route/spotify/data.ts` | `now-playing`·`playlists` (`withSpotifyAuth`) |
| `route/spotify/playing.ts` | 공개 위젯 `:token`(SVG)·`:token/widget`(HTML)·`:token/data`(JSON) |
| `route/spotify/widget-token.ts` | 위젯 토큰 목록·발급·삭제·활성 토글 (세션) |
| `service/domain/spotify/spotify-account.ts` | 계정 CRUD + 소유권 검증(`assertOwnership`) |
| `service/domain/spotify/spotify-api-key.ts` | API 키 생성/검증/폐기/목록, 검증 시 `lastUsedAt` 갱신 |
| `service/domain/spotify/spotify-widget-token.ts` | 위젯 토큰 생성/검증(active 확인)/폐기/목록/토글 |
| `service/domain/spotify/spotify-oauth-connect.ts` | OAuth authorize URL 생성·콜백(토큰 교환·프로필 조회·계정 upsert) |
| `service/domain/spotify/spotify-provider.ts` | Spotify API 호출 래퍼(토큰 주입, 401 refresh, 429 backoff) + `createSpotifyProviderFactory`(계정 조회·`isActive` 집행 후 provider 생성) |
| `service/domain/spotify/spotify-data.ts` | now-playing/playlists 를 도메인 뷰모델로 정규화 |
| `service/domain/spotify/spotify-widget.ts` | now-playing 데이터로 SVG/HTML 위젯 생성, 앨범아트 base64 인라인 |
| `compose/spotify.ts` | ServiceDb(Drizzle) 인라인 구현 + provider 팩토리 + 앨범아트 캐시 조립 |
| `lib/with-spotify-auth.ts` | 데이터 엔드포인트용 인증 HOF(API 키 또는 세션+accountId) |
| `lib/hmac-state.ts` | OAuth state 서명/검증(HMAC-SHA256, base64url, TTL) |
| `lib/token-utils.ts` | `generateToken`(32바이트 hex) · `hashToken`(SHA-256 hex) — 공유 |
| `service/shared/cache.ts` | LRU+TTL 인메모리 캐시(앨범아트 캐시에 사용) — 공유 |
| `tests/dto/spotify/*`, `tests/route/spotify/*`, `tests/service/domain/spotify/*`, `tests/lib/with-spotify-auth.test.ts`, `tests/page/admin/spotify.test.ts` | 테스트 |

## 데이터 모델

`db/schema.ts` 기준. 3개 테이블 모두 `user_id → user.id`(cascade). 상세 전수는 [../reference/db-schema.md](../reference/db-schema.md).

- `spotify_accounts` (`SpotifyAccount`): `id`(int PK, autoincrement), `user_id`, `spotify_user_id`, `display_name`, `email`, `better_auth_account_id`(better-auth `account.id` 참조 — OAuth 토큰 접근 키), `is_active`(기본 true), `created_at`, `updated_at`. 인덱스 `idx_spotify_accounts_user(user_id)`, 유니크 `uq_spotify_accounts_user_spotify(user_id, spotify_user_id)`.
- `spotify_api_keys` (`SpotifyApiKey`): `id`(int PK), `user_id`, `spotify_account_id`(→ `spotify_accounts.id`, cascade), `token`(varchar 64, unique — SHA-256 해시 저장), `name`, `expires_at`, `last_used_at`, `created_at`. 인덱스 user/account.
- `spotify_widget_tokens` (`SpotifyWidgetToken`): `id`(int PK), `user_id`, `spotify_account_id`(→ cascade), `token`(varchar 64, unique — 해시 저장), `name`, `is_active`(기본 true), `created_at`, `updated_at`. 인덱스 user/account.
- OAuth access/refresh 토큰은 이 도메인 테이블이 아니라 better-auth `account` 테이블에 저장된다(`access_token`/`refresh_token`/`access_token_expires_at`/`scope`, `provider_id='spotify'`).

## API 엔드포인트

mount 접두사: `index.ts` 가 `api` 라우터를 `/api` 에 마운트. `route/index.ts` 가 아래 서브경로에 각 라우트를 마운트.

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/api/spotify/accounts` | 세션 | 내 Spotify 계정 목록 |
| GET | `/api/spotify/accounts/connect` | 세션 | OAuth 시작 — Spotify authorize 로 302 redirect (`redirect` 쿼리 선택) |
| GET | `/api/spotify/accounts/connect/callback` | 세션 | OAuth 콜백 — 토큰 교환·계정 upsert 후 302(`?success=true` 또는 `?error=`) |
| GET | `/api/spotify/accounts/:accountId` | 세션 | 계정 상세 |
| PATCH | `/api/spotify/accounts/:accountId` | 세션 | `displayName`/`isActive` 수정 |
| DELETE | `/api/spotify/accounts/:accountId` | 세션 | 계정 삭제 |
| GET | `/api/spotify/keys` | 세션 | API 키 목록(해시 제외, 메타만) |
| POST | `/api/spotify/keys` | 세션 | API 키 발급 — 평문 `{ key }` 1회 반환 |
| DELETE | `/api/spotify/keys/:id` | 세션 | API 키 삭제 |
| GET | `/api/spotify/now-playing` | API 키 또는 세션+`accountId` | 현재 재생(없으면 최근 재생 fallback) |
| GET | `/api/spotify/playlists` | API 키 또는 세션+`accountId` | 플레이리스트 목록(`limit`/`offset`) |
| GET | `/api/spotify/widget-tokens` | 세션 | 위젯 토큰 목록 |
| POST | `/api/spotify/widget-tokens` | 세션 | 위젯 토큰 발급 — 평문 `{ token }` 1회 반환 |
| DELETE | `/api/spotify/widget-tokens/:id` | 세션 | 위젯 토큰 삭제 |
| PATCH | `/api/spotify/widget-tokens/:id/active` | 세션 | `isActive` 토글 |
| GET | `/api/spotify/playing/:token` | 위젯 토큰(공개) + rate limit | SVG 배지(`image/svg+xml`) |
| GET | `/api/spotify/playing/:token/widget` | 위젯 토큰(공개) + rate limit | HTML 위젯(5초 폴링, 진행바 애니메이션) |
| GET | `/api/spotify/playing/:token/data` | 위젯 토큰(공개) + rate limit | now-playing JSON(`Access-Control-Allow-Origin: *`) |

- 세션 인증은 `withAuth` HOF(better-auth `getSession`). `now-playing`/`playlists` 만 `withSpotifyAuth`(아래 §핵심 흐름).
- **공개 playing 3종에는 rate limit 이 걸린다**: `route/index.ts` 가 만든 공용 인메모리 리미터(분당 60회)를 `checkLimit` 으로 주입하고, 키는 `public:{token}:{IP}:spotify:playing` 이다(IP 는 `x-forwarded-for` 첫 값 → `x-real-ip` → `unknown`). 토큰 검증 **전에** 판정하므로 무효 토큰 폭주도 차단된다. 세 응답 모두 `X-RateLimit-Limit`/`-Remaining`/`-Reset` 헤더가 붙고, 초과 시 429 `RATE_LIMIT_EXCEEDED`. 이 리미터는 인스턴스별 인메모리라 다중 인스턴스에서는 한도가 느슨해질 수 있다(IP 키라 소비자 영향 없음 — [../acknowledge/2026-09-06-consumer-repos-and-compat.md](../acknowledge/2026-09-06-consumer-repos-and-compat.md)).
- `describeRoute`(OpenAPI) 는 account/key/data 라우트만 선언(tag `Spotify`). widget-token·playing 라우트는 OpenAPI 미선언.
- `now-playing`/`playlists`/`playing/*` 응답 본문 구조는 코드상 `describeRoute` 스키마로 고정되어 있지 않다(반환 형태는 §핵심 흐름 참조).

## 핵심 흐름

### 1. 계정 연결(OAuth Authorization Code)

- `GET /accounts/connect` → `spotifyOAuthConnect.generateAuthUrl(userId, baseUrl, redirect?)`:
  - `redirect` 는 `isAllowedRedirect` 통과 시에만 state 에 담는다.
  - `createOAuthState({ userId, redirect }, BETTER_AUTH_SECRET, 10분)` 로 HMAC 서명 state 생성(`lib/hmac-state.ts`).
  - scope `user-read-currently-playing user-read-playback-state playlist-read-private user-read-recently-played`, `redirect_uri = ${baseUrl}/api/spotify/accounts/connect/callback` 로 authorize URL 구성 → 302.
- `GET /accounts/connect/callback` → 에러/`code`·`state` 누락 시 허용 redirect(또는 baseUrl)로 `?error=oauth_denied`. 정상 시 `handleCallback(code, state, sessionUserId, baseUrl)`:
  1. `handleCallback` 이 `verifyOAuthState`(HMAC 서명·exp 만료 검증)를 실행하고, 이어서 `state.userId === sessionUserId` 를 직접 확인. 어느 하나라도 실패 → `SPOTIFY_OAUTH_STATE_INVALID`. (userId 대조는 `verifyOAuthState` 가 아니라 `handleCallback` 이 수행)
  2. `POST accounts.spotify.com/api/token`(Basic 인증 `clientId:clientSecret`, `grant_type=authorization_code`). 실패 → `SPOTIFY_OAUTH_EXCHANGE_FAILED`.
  3. `GET api.spotify.com/v1/me` 프로필 조회. 실패/`id` 없음 → `SPOTIFY_OAUTH_EXCHANGE_FAILED`.
  4. better-auth `account` 테이블 upsert(access/refresh/`accessTokenExpiresAt`/scope, `providerId='spotify'`, id=기존 또는 `crypto.randomUUID()`).
  5. `spotify_accounts` upsert(userId+spotifyUserId 기준: 있으면 displayName/email/betterAuthAccountId 갱신, 없으면 생성).
  6. 성공 시 허용 redirect(또는 baseUrl)로 `?success=true&spotifyUserId=...`.

### 2. provider 생성과 `isActive` 집행(`spotify-provider.ts`)

- provider 는 항상 `createSpotifyProviderFactory`(`service/domain/spotify/spotify-provider.ts:106-115`)가 만든 함수로 생성된다. `compose/spotify.ts:131-168` 이 `findAccount`·`getOAuthToken`·`refreshOAuthToken` 3개 의존성을 주입한다.
- 팩토리는 `findAccount(spotifyAccountId)` 결과가 **없거나 `isActive === false` 이거나 `betterAuthAccountId` 가 없으면 `SPOTIFY_ACCOUNT_NOT_FOUND`(404)** 를 던진다. 즉 `isActive` 는 **provider 생성 지점 한 곳에서만** 집행된다(`with-spotify-auth.ts`·`spotify-widget-token.ts` 에는 검사가 없다).
- 영향 경로 3종 — 계정을 `isActive=false` 로 토글하면 아래가 전부 404 로 바뀐다(이전에는 200 으로 정상 응답했다).

  | 경로 | 도달 방식 |
  |------|-----------|
  | `GET /api/spotify/now-playing` | `route/spotify/data.ts:42` → `spotifyDataService.getNowPlaying` → `createProvider` |
  | `GET /api/spotify/playlists` | `route/spotify/data.ts:62` → `spotifyDataService.getPlaylists` → `createProvider` |
  | `GET /api/spotify/playing/:token`(+ `/widget`·`/data`) | `spotify-widget.ts:80` → `spotifyDataService.getNowPlaying` → `createProvider` |

  위젯 경로는 위젯 토큰 자체의 `isActive`(→ `SPOTIFY_WIDGET_TOKEN_INACTIVE` 403)와 별개다. 토큰은 활성인데 계정이 비활성이면 404 다.

### 3. 토큰 갱신(`spotify-provider.ts`)

- provider 는 `betterAuthAccountId` 로 `account` 테이블에서 access/refresh 토큰을 읽는다(`getOAuthToken`).
- Spotify API 호출은 `spotifyFetch`(기본 재시도 `MAX_RETRIES=3`):
  - `401` → `refreshToken()` 후 재시도. refresh 는 `POST .../api/token`(`grant_type=refresh_token`)로 새 access token 을 받아 `account.accessToken`·`accessTokenExpiresAt` 갱신.
  - **refresh 실패는 `SPOTIFY_API_ERROR`(502)**. `refreshOAuthToken` 은 예외를 던지지 않고 `{ accessToken }` 또는 `{ status }`(HTTP 상태) 유니온을 반환하고(`compose/spotify.ts:146-168`), provider 가 `status` 쪽이면 `createAppError('SPOTIFY_API_ERROR', { status })` 를 던진다(`spotify-provider.ts:40`). 저장된 refresh token 이 아예 없을 때도 같은 코드(`detail: 'No refresh token'`)다. 이전에는 `new Error(...)` 라 `INTERNAL_ERROR`(500)로 나갔다.
  - `429` → `Retry-After`(없거나 비정상이면 1초) 만큼 대기 후 재시도하되, **한 요청의 대기 총합이 3초를 넘으면 자지 않고 즉시** `SPOTIFY_API_ERROR`(502, `details.status = 429`) 를 던진다. 이전에는 `Retry-After` 를 최대 60초까지 그대로 자서 재시도 3회면 요청 하나가 최대 180초 매달릴 수 있었다(서버리스 타임아웃 소진).
  - 동시 refresh 는 `refreshPromise` 로 single-flight(중복 방지).
  - refresh 응답에 **새 `refresh_token` 이 오면 함께 저장**한다(`compose/spotify.ts`). 회전형 refresh token 을 발급하는 경우 옛 토큰만 남아 다음 갱신이 실패하던 경로를 막는다. 없으면 기존 값을 유지한다.
- 갱신은 **401 반응형**이다. 저장된 `accessTokenExpiresAt` 를 미리 읽어 선제 갱신하지 않는다.

### 4. 데이터 인증(`withSpotifyAuth`)

- `X-Spotify-Key` 헤더 있으면 → `spotifyApiKeyService.validate` → `{ spotifyAccountId, userId }`. 무효/만료 → `SPOTIFY_KEY_INVALID`.
- 헤더 없으면 → 세션 필요(없으면 `UNAUTHORIZED`) + `accountId` 쿼리 필수(누락/비정상 → `VALIDATION_ERROR`), `spotifyAccountService.getById(accountId, userId)` 로 소유권 확인(아니면 `SPOTIFY_ACCOUNT_NOT_FOUND`).

### 5. now-playing / playlists 반환(`spotify-data.ts`)

- `getNowPlaying` → `{ isPlaying, track | null, lastPlayedAt | null }`. 재생 중이면 `track`(+ `progressMs`), 아니면 `recently-played[0]` 로 fallback(`track` + `played_at`), 둘 다 없으면 모두 null. `track = { name, artist(아티스트명 join), album, albumArt(첫 이미지 url), externalUrl, durationMs, progressMs }`. 각 호출 후 `provider.disconnect()`.
- `getPlaylists(limit, offset)` → `{ items[], total, limit, offset }`. `item = { id, name, description, imageUrl(첫 이미지), trackCount(tracks.total), isPublic(public), externalUrl }`.

### 6. 공개 위젯(`playing.ts` + `spotify-widget.ts`)

- 경로 `:token` 을 `spotifyWidgetTokenService.validate` 로 검증(해시 조회 → 없으면 `SPOTIFY_WIDGET_TOKEN_NOT_FOUND`, 비활성 → `SPOTIFY_WIDGET_TOKEN_INACTIVE`) 후 `spotifyAccountId` 획득.
- 테마 쿼리(`radius` 0–50, `bg`/`color`/`secondary`/`accent` 는 3–8자리 hex 정규식 통과 시만 적용, 아니면 `DEFAULT_THEME`).
- `:token`(SVG): now-playing 이면 배지, 아니면 "Not Playing" SVG. 앨범아트는 fetch → base64 data URI 로 SVG 에 인라인.
- `:token/widget`(HTML): `baseUrl` 로 만든 `/data` URL 을 5초마다 폴링하는 정적 HTML(진행바 tick).
- `:token/data`(JSON): `getNowPlayingData` 결과를 `successResponse` 로. CORS `*`.

## 환경변수

이 도메인이 쓰는 것만(모두 `lib/env.ts` 에서 optional). 전수는 [../reference/env.md](../reference/env.md).

- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` — OAuth authorize/토큰 교환·갱신의 클라이언트 자격. `compose/spotify.ts` 에서 미설정 시 `''` fallback(교환 실패로 이어짐).
- `BETTER_AUTH_SECRET` — OAuth state HMAC 서명 시크릿(`createOAuthState`/`verifyOAuthState` 의 `secret`).
- `BASE_URL` — OAuth `redirect_uri` 와 HTML 위젯의 `/data` 폴링 URL 구성에 사용. `compose/index.ts` 에서 `env.BASE_URL ?? ''`.

## 에러 코드

`lib/error-code.ts`·`error-message.ts`·`error.ts` 기준(괄호는 HTTP status).

- `SPOTIFY_ACCOUNT_NOT_FOUND`(404) — 계정 없음/소유자 불일치(`assertOwnership`), **또는 provider 생성 시 계정이 비활성(`isActive=false`)이거나 `betterAuthAccountId` 미연결**(`createSpotifyProviderFactory`).
- `SPOTIFY_ACCOUNT_ALREADY_EXISTS`(409) — 3파일에 정의되어 있으나 현재 소스에서 throw 되지 않음(연결은 upsert 로 처리).
- `SPOTIFY_OAUTH_STATE_INVALID`(400) — state 서명/만료/userId 불일치.
- `SPOTIFY_OAUTH_EXCHANGE_FAILED`(502) — 토큰 교환 또는 프로필 조회 실패.
- `SPOTIFY_API_ERROR`(502) — Spotify API 호출 실패(토큰 없음, **OAuth refresh 실패** 포함). refresh 실패 시 `details.status` 에 Spotify 토큰 엔드포인트의 HTTP 상태가 담긴다(프로덕션 응답에는 `details` 미노출).
- `SPOTIFY_KEY_INVALID`(401) — `X-Spotify-Key` 무효/만료.
- `SPOTIFY_WIDGET_TOKEN_NOT_FOUND`(404) — 위젯 토큰 없음.
- `SPOTIFY_WIDGET_TOKEN_INACTIVE`(403) — 위젯 토큰 비활성.
- 공용: `UNAUTHORIZED`, `VALIDATION_ERROR`, `SERVICE_NOT_CONFIGURED`(connect 라우트에서 의존성/`baseUrl` 미구성 가드).

## 테스트

- `bun test tests/dto/spotify` — account/api-key/data/widget-token DTO
- `bun test tests/route/spotify` — account/data/key/playing/widget-token 라우트
- `bun test tests/service/domain/spotify` — account/api-key/data/oauth-connect/provider/widget/widget-token 서비스
- `bun test tests/lib/with-spotify-auth.test.ts` — 데이터 인증 HOF
- `bun test tests/page/admin/spotify.test.ts` — 어드민 Spotify 페이지

## 주의사항 / 함정

- **키 노출은 1회뿐**: API 키/위젯 토큰은 발급 응답에서만 평문(`{ key }` / `{ token }`)을 돌려주고 DB 엔 SHA-256 해시만 저장. 목록 조회에는 토큰이 포함되지 않는다.
- **API 키 만료 미설정**: `spotify-api-key.ts` `create` 는 `expiresAt` 를 설정하지 않아(insert 페이로드에 미포함, 컬럼 기본 `null`) 항상 `null` 이다. `validate` 는 `expiresAt` 만료를 검사하지만, 발급 경로가 값을 채우지 않으므로 기본적으로 만료되지 않는다.
- **`isActive=false` 는 404 로 나타난다**: 계정 비활성 토글은 목록 조회·PATCH 에는 영향이 없고, 실제 Spotify 데이터를 읽는 3개 경로에서만 `SPOTIFY_ACCOUNT_NOT_FOUND`(404)로 드러난다(위 §2). 소비자는 "계정 없음" 과 "계정 비활성" 을 응답으로 구분할 수 없다.
- **위젯 토큰 vs API 키**: 위젯 토큰은 URL 경로 기반 공개 인증(위젯 임베드용, `isActive` 토글로 비활성화 가능), API 키는 `X-Spotify-Key` 헤더 기반(프로그램의 now-playing/playlists 접근용). 발급 시 위젯 토큰은 16바이트(32 hex), API 키는 32바이트(64 hex) 평문.
- **공개 위젯은 보안 헤더 제외**: `index.ts` 의 `securityExcludePaths: ['/api/spotify/playing', ...]` 로 인해 이 경로만 `X-Frame-Options: DENY` 와 `Content-Security-Policy`(둘 다 iframe 임베드를 막음 — CSP 에 `frame-ancestors 'none'`)가 붙지 않는다(`middleware/security-headers.ts`) — 외부 사이트 iframe/img 임베드 허용 목적.
- **응답 캐시 없음, 앨범아트만 서버 캐시**: 위젯/데이터 응답은 모두 `Cache-Control: no-cache`(SVG 는 `no-store` 포함). 유일한 캐시는 `compose/spotify.ts` 의 앨범아트 base64 캐시(`createCache`, `maxSize=200`, TTL 5분, 앨범아트 URL 키)로 SVG 생성에만 쓰인다. provider 의 access token 은 인스턴스 메모리에만 있고 요청 처리 후 `disconnect()` 로 비워진다.
- **라우트 순서 의존**: `route/spotify/account.ts` 는 `/connect`·`/connect/callback` 를 `/:accountId` 보다 먼저 등록한다(뒤에 두면 `connect` 가 `:accountId` 로 매칭됨).
- **now-playing 은 재생 없을 때 recently-played fallback**: `isPlaying:false` 여도 최근 곡을 반환할 수 있으므로 "재생 중"과 "최근 재생"을 소비 측에서 `isPlaying`/`lastPlayedAt` 로 구분해야 한다.
- **API 키 `last_used_at` 갱신은 응답 전 `await`** 다(`spotify-api-key.ts` `validate`). 실패는 `captureException` 으로 삼키지만, 서버리스에서 응답 후 실행이 끊겨 사용 시각이 유실되던 경로는 없어졌다.
- **`parseStatePayload` 는 서명 미검증**: 콜백 에러 경로에서 redirect 대상을 뽑을 때만 쓰는 best-effort 파서(서비스 `parseRedirectFromState` 가 이를 래핑해 라우트가 호출)로, 신뢰 판단에 쓰지 않는다(신뢰 검증은 `verifyOAuthState`).

## 관련 문서

- 어드민 Spotify 관리 UI: [../admin-features.md](../admin-features.md) §10 (`/admin/spotify/*`)
- Hono 라우팅·HOF·응답 헬퍼 패턴: [../hono-reference.md](../hono-reference.md)
- 스키마 전수: [../reference/db-schema.md](../reference/db-schema.md) · 환경변수 전수: [../reference/env.md](../reference/env.md)
