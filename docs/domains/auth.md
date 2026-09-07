# 인증 · 보안 (auth) — 횡단 도메인

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 다루는 코드: `service/shared/auth-provider.ts` · `service/shared/api-token.ts` · `route/auth/oauth.ts` · `route/auth/token.ts` · `lib/with-auth.ts` · `lib/token-utils.ts` · `lib/rate-limit.ts` · `lib/with-rate-limit.ts` · `lib/hmac-state.ts` · `lib/url-validator.ts` · `lib/sensitive-filter.ts` · `middleware/require-*.ts` · `middleware/security-headers.ts` · `page/admin/guard.ts` · `db/schema.ts`(user·session·account·verification·api_token 등)

이 문서는 도메인 하나가 아니라 **b-hub 전 도메인에 걸치는 인증·인가·보안 메커니즘**을 소유한다. 도메인별 데이터/로직은 각 도메인 문서, 어드민 화면은 [../admin-features.md](../admin-features.md), 디바이스 키 수집/쿼터는 [../logging.md](../logging.md) 참조.

---

## 1. 인증 수단 총람

b-hub 은 단일 세션 체계가 아니라 **용도별 6종의 자격증명**을 쓴다. 각각 검사 지점·저장·적용 라우트가 다르다.

| 수단 | 전달 방식 | 검사 지점(HOF/미들웨어/서비스) | 적용 라우트 | 저장(테이블) |
|------|-----------|-------------------------------|-------------|--------------|
| 브라우저 세션 | better-auth 쿠키 | `getSession()` → `withAuth`(`lib/with-auth.ts`) / `requireAdminPage`(어드민) | `/api/auth/token`, 사용자별 API 대부분, `/admin/*` | `session`·`user`·`account` |
| 어드민(role) | 세션 + `user.role === 'admin'` | `withAdmin`(`lib/with-auth.ts`) / 라우트 내부 `requireAdmin` 클로저 / `requireAdminPage` | `route/logs/*`·`route/weather/key.ts`·`route/blog/admin·category·tag`, 어드민 SSR 전체 | `user.role` |
| API 토큰 | `X-API-Token` 헤더 | `withApiToken`/`requireApiToken`(**현재 라우트 미연결**, §4.3) | 없음(발급·관리만 세션으로) | `api_token`(sha256 해시) |
| 디바이스 키 | `X-Device-Key` 헤더 | `requireDeviceKey`(`middleware/require-device-key.ts`) | `/api/logs*` | `device_key`(sha256, [../logging.md](../logging.md)) |
| weather 키 | `X-Weather-Key` 헤더 | `requireWeatherKey` / `requireWeatherKeyNoLog`(`middleware/require-weather-key.ts`) | weather 조회 라우트 | `weather_api_key`(sha256) |
| spotify 위젯 토큰 | URL 경로 파라미터 `:token` | `spotifyWidgetTokenService.validate()`(`route/spotify/playing.ts`) | `/api/spotify/playing/:token[/widget|/data]` | `spotify_widget_tokens`(sha256, `is_active`) |

- 부가: **spotify API 키**(`X-Spotify-Key` 헤더)는 `withSpotifyAuth`(`lib/with-spotify-auth.ts`)가 검사한다. 헤더가 없으면 세션 + `accountId` 쿼리로 폴백. 저장은 `spotify_api_keys`.
- 모든 토큰류(api_token / device_key / weather_api_key / spotify_api_keys / spotify_widget_tokens)는 **평문을 저장하지 않고 sha256 해시**(`lib/token-utils.ts` `hashToken`)로 저장한다. `token` 컬럼은 전부 `varchar(64) unique`.

---

## 2. better-auth 구성 (`service/shared/auth-provider.ts`)

`createAuthProvider(deps)` 가 `betterAuth(...)` 인스턴스를 만든다(설정을 `const options: BetterAuthOptions` 로 조립 후 `betterAuth(options)`). 조립은 `compose/shared.ts`(`composeShared`)에서 env 를 주입. **반환 타입만 `: Auth` 로 명시**한다(코드베이스의 "반환타입 미명시" 규칙 예외 — better-auth 1.6 타입 안정성·`AuthProvider = ReturnType<...>` 유도용). `deps.isProduction` 은 compose 가 `env.NODE_ENV === 'production'` 으로 주입한다(auth-provider 는 `process.env` 를 직접 읽지 않음).

- `baseURL`: `deps.baseUrl`(= `env.BASE_URL ?? 'http://localhost:9999'`)
- `secret`: `env.BETTER_AUTH_SECRET`
- `database`: `drizzleAdapter(db, { provider: 'mysql' })`
- `emailAndPassword`: `{ enabled: false }` — **비밀번호 로그인 없음, 소셜 OAuth 전용**
- `socialProviders`:
  - `github`: `clientId`/`clientSecret`(= `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`)
  - `google`: `clientId`/`clientSecret`(= `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`), `accessType: 'offline'`, `prompt: 'consent'`, `scope`: `openid`·`email`·`profile`·`gmail.modify`·`gmail.send`·`drive.file`
- `plugins`: `admin({ defaultRole: 'user', adminRoles: ['admin'] })`

### 2.1 trusted origins

```
ALWAYS_TRUSTED_ORIGINS = ['*.gumyo.net', '*.hyns.dev', '*.seok.dev']
trustedOrigins = [...new Set([...ALWAYS_TRUSTED_ORIGINS, ...(env.TRUSTED_ORIGINS?.split(',') ?? [])])]
```

- 세 서브도메인 와일드카드는 **하드코딩 상수**로 항상 신뢰. env `TRUSTED_ORIGINS`(콤마 구분)를 추가 병합하고 `Set` 으로 중복 제거.
- `advanced.crossSubDomainCookies`: `enabled: deps.isProduction`(= **프로덕션일 때만**, compose 가 `env.NODE_ENV === 'production'` 주입), `domain: '.gumyo.net'`. 즉 프로덕션에서 `*.gumyo.net` 간 세션 쿠키 공유(`.hyns.dev`·`.seok.dev` 는 크로스서브도메인 쿠키 대상 아님).

### 2.2 세션 정규화 (`compose/shared.ts`)

```
getSession(c) = auth.api.getSession({ headers: c.req.raw.headers })
  → null 이면 null, 아니면 { user: { id, name, email, role, image } }
```

- `role` 은 better-auth 기본 타입에 없어 `(session.user as Record<string, unknown>).role` 로 캐스팅해 꺼낸다.
- 모든 HOF/미들웨어/어드민 가드는 이 **정규화된 `getSession` 한 개**에만 의존한다(better-auth 세부 타입 비의존).

### 2.3 세션 모델 테이블 (`db/schema.ts`)

better-auth 가 관리하는 4개 테이블(모두 `id varchar(36)`):

| 테이블 | 핵심 컬럼 | 비고 |
|--------|-----------|------|
| `user` | `email`(unique)·`role`(text, nullable)·`banned`/`ban_reason`/`ban_expires`·`timezone`(기본 `Asia/Seoul`)·`storage_quota_bytes` | `role` NULL = 일반, `'admin'` = 어드민 |
| `session` | `token`(unique)·`expires_at`·`user_id`(FK cascade)·`ip_address`·`user_agent`·`impersonated_by` | |
| `account` | `provider_id`·`account_id`·`access_token`/`refresh_token`/`id_token`·`scope`·`*_expires_at` | OAuth 계정 링크. gmail/drive refresh token 도 여기 저장 |
| `verification` | `identifier`·`value`·`expires_at` | better-auth 표준 |

---

## 3. `route/auth/*` 엔드포인트

`route/index.ts` 에서 API 라우터(`/api` 마운트) 하위에 붙는다.

| 메서드 | 경로 | 인증 | 핸들러 | 설명 |
|--------|------|------|--------|------|
| GET·POST | `/api/auth/*` | (better-auth 내부) | `createOAuthRoute` → `auth.handler(c.req.raw)` | 로그인/OAuth 콜백/세션/로그아웃 등 better-auth 표준 엔드포인트를 통째로 위임(`route.on(['POST','GET'], '/*', ...)`) |
| GET | `/api/auth/token` | 세션(`withAuth`) | `createTokenRoute` | 내 API 토큰 목록(id·name·createdAt·lastUsedAt) |
| POST | `/api/auth/token` | 세션(`withAuth`) | 〃 | API 토큰 발급, body `{ name? }`, 응답 `{ token }`(평문 1회 노출) |
| DELETE | `/api/auth/token` | 세션(`withAuth`) | 〃 | API 토큰 폐기, body `{ token }`(평문 해시 후 매칭) |

- 토큰 라우트는 `Hono<AuthContext>` 로 만들어지고 3개 메서드 모두 `withErrorHandling(withAuth({ getSession })(...))` 로 감싼다. 발급/조회/폐기 모두 **세션 소유자 본인 것만** 다룬다.
- OAuth 라우트는 검증/에러 래핑 없이 better-auth 핸들러로 pass-through(better-auth 가 자체 처리).

---

## 4. 인증 검사 HOF / 미들웨어

### 4.1 HOF (`lib/with-auth.ts`) — 실제 사용 경로

핸들러를 감싸 인증된 `user` 를 2번째 인자로 넘긴다. 합성 순서는 **바깥 `withErrorHandling` → 안쪽 `withAuth`/`withAdmin`**.

| HOF | 검사 | 실패 | 사용처(예) |
|-----|------|------|-----------|
| `withAuth({ getSession })` | 세션 존재 | `UNAUTHORIZED`(401) | 토큰 라우트, mail/spotify/drive/calendar 등 사용자 라우트 다수 |
| `withAdmin({ getSession })` | 세션 + `role === 'admin'` | `UNAUTHORIZED` / `FORBIDDEN`(403) | `route/logs/log-event.ts`·`route/logs/device-key.ts`·`route/weather/key.ts` |
| `withApiToken({ validateToken })` | `X-API-Token` 헤더 유효 | `API_TOKEN_INVALID`(401) | **없음(§4.3)** |

- 일부 라우트는 HOF 대신 **라우트 파일 내부 로컬 `requireAdmin` 클로저**로 같은 검사를 인라인한다: `route/blog/admin.ts`·`route/blog/category.ts`·`route/blog/tag.ts`(`getSession` → 없으면 `UNAUTHORIZED`, `role!=='admin'` 이면 `FORBIDDEN`).

### 4.2 미들웨어 (`middleware/require-*.ts`)

Hono `use()` 형 미들웨어. 통과 시 `c.set('user', ...)` 로 컨텍스트에 주입.

- `requireAuth`: 세션 없으면 `UNAUTHORIZED`.
- `requireAdmin`: 세션 없으면 `UNAUTHORIZED`, `role!=='admin'` 이면 `FORBIDDEN`.
- `requireApiToken`: `X-API-Token` 없거나 `validateToken` 실패 시 `API_TOKEN_INVALID`. 성공 시 `user` 에 `{ id, name:'', email:'', role:null, image:null }` 주입.
- `requireDeviceKey`·`requireWeatherKey`(§weather 키)는 각각 디바이스/weather 도메인에서 사용.

### 4.3 함정 — 미연결(dormant) 가드

`requireAuth`·`requireAdmin`·`requireApiToken` 3개 미들웨어와 `withApiToken` HOF, 그리고 `apiTokenService.validate()` 는 **정의·테스트만 되어 있고 어떤 라우트에도 연결돼 있지 않다**(코드 전수 grep 확인). 현재 런타임 인증은 전부 `getSession` 기반(`withAuth`/`withAdmin`/로컬 클로저/`requireAdminPage`)으로 흐른다.

- 결과: `api_token` 발급·목록·폐기는 되지만(§3, 세션으로 보호), 발급한 토큰을 `X-API-Token` 으로 제출해 API 를 호출하는 경로는 **아직 활성화돼 있지 않다.** 새 라우트에 헤더 토큰 인증을 붙이려면 `withApiToken`(또는 `requireApiToken`)에 `validateToken: apiTokenService.validate` 를 주입해 연결해야 한다.

---

## 5. API 토큰 발급·해시·만료 (`service/shared/api-token.ts` · `lib/token-utils.ts`)

- **발급** `create(userId, name?, expiresInDays = 90)`: `generateToken()` 으로 평문 생성 → `hashToken()`(sha256 hex) → `api_token` 에 해시·`name`·`expiresAt = now + 90일` insert. **평문은 반환값으로 1회만** 노출.
- **생성기** `generateToken()`: `crypto.getRandomValues(new Uint8Array(32))` → hex 문자열(64자). `hashToken(t)`: `createHash('sha256').update(t).digest('hex')`.
- **검증** `validate(token)`: 해시로 조회 → 없으면 `null` → `expiresAt` 경과면 `null` → 유효하면 `{ id: userId }`. `lastUsedAt` 은 마지막 갱신에서 5분 이상 지났을 때만 UPDATE 한다(4차 P-07, `LAST_USED_UPDATE_INTERVAL_MS`). (§4.3 대로 현재 호출부 없음)
- **폐기** `revoke(userId, token)`: `(userId, hash)` 매칭 삭제(본인 토큰만).
- **목록** `listByUser(userId)`.
- `api_token` 테이블: `id int PK` · `user_id`(FK cascade) · `token varchar(64) unique` · `name varchar(100)` · `expires_at` · `last_used_at` · `created_at`. 인덱스 `idx_api_token_user(user_id)`.

---

## 6. 레이트리밋 (`lib/rate-limit.ts` · `lib/with-rate-limit.ts`)

### 6.1 저장소 / 알고리즘

`createRateLimiter({ windowMs, maxRequests })`:

- 저장소는 **프로세스 로컬 인메모리 `Map<string, { count, resetAt }>`**. `setInterval(cleanup, windowMs)` 로 만료 엔트리 정리.
- `checkLimit(key)`: 고정 윈도우. 엔트리 없거나 만료면 `count=1`·`resetAt=now+windowMs` 로 리셋, 아니면 `count++`. 반환 `{ allowed, limit, remaining, resetAt }`. `reset(key)` 도 제공.

### 6.2 적용 (`with-rate-limit.ts`)

`withRateLimit({ checkLimit, pathKey? })(handler)` 는 **인증된 핸들러를 감싸는** HOF(2번째 인자 `user` 를 받음 → `withAuth` 안쪽에 합성).

- 키는 `user.id`, 경로는 `deps.pathKey ?? c.req.path` 로 `checkLimit(user.id, path)` 호출. `pathKey` 를 주면 실제 URL 대신 고정 문자열로 카운트(AI 라우트가 `:sessionId` 같은 가변 경로를 묶으려고 사용 — §6.3).
- 응답 헤더 `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` 설정.
- `!allowed` 이면 `RATE_LIMIT_EXCEEDED`(429).

### 6.3 적용 지점 전수

`createRateLimiter` 인스턴스화는 코드 전체에서 **`compose/mail.ts` · `compose/ai.ts` 2곳**(AI 프로바이더 시스템 신설로 추가):

```
mailRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 20 })
mailCheckLimit  = (key, path) => mailRateLimiter.checkLimit(`mail:${key}:${path}`)

aiRateLimiter   = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })
aiCheckLimit    = (key, path) => aiRateLimiter.checkLimit(`ai:${key}:${path}`)
```

- **mail: 사용자·경로별 60초당 20회**(키 = `mail:{userId}:{path}`). `route/index.ts` 가 `mailCheckLimit` 을 주입 → `withRateLimit` 이 걸리는 엔드포인트 2개:
  - `POST /api/mail/sync`(동기화 트리거, `route/mail/sync.ts`)
  - `POST /api/mail/messages/send`(메일 발송, `route/mail/message.ts`)
- **ai: 사용자·pathKey별 60초당 30회**(키 = `ai:{userId}:{pathKey}`, pathKey 고정문자열로 가변 경로 묶음 §6.2). `route/index.ts` 가 `aiCheckLimit` 을 주입 → `withRateLimit` 이 걸리는 엔드포인트 3개:
  - `POST /api/ai/sessions/:sessionId/messages`(채팅 전송, pathKey `ai:chat:send`, `route/ai/chat.ts`)
  - `POST /api/ai/completions`(단발 completion, pathKey `ai:chat:completion`, `route/ai/chat.ts`)
  - `POST /api/ai/attachments`(첨부 업로드, pathKey `ai:attachment:upload`, `route/ai/attachment.ts`)
- 모든 라우트가 `deps.checkLimit` 미주입 시엔 레이트리밋 없이 동작하도록 삼항 분기(방어).

### 6.4 함정 / 구분

- **인메모리라 서버리스 인스턴스 간 공유되지 않는다.** Vercel 함수가 여러 인스턴스로 뜨거나 콜드스타트되면 카운트가 인스턴스별로 갈리거나 초기화된다(엄밀한 전역 리밋 아님).
- 이 인메모리 리밋은 **디바이스 키·weather 키의 "일일 쿼터"와 완전히 별개**다. 후자는 DB 카운트 기반: 디바이스 키는 `log_events` 카운트([../logging.md](../logging.md)), weather 키는 `weather_api_key.daily_limit`(기본 100) 기준으로 `checkRateLimit` 하고 429(`*_KEY_RATE_LIMIT`) 를 던진다.

---

## 7. OAuth connect HMAC state (`lib/hmac-state.ts`)

better-auth 소셜 로그인과 별개로, **mail(Gmail)·spotify 계정 연결 플로우**가 자체 OAuth 를 돌리며 CSRF 방지용 서명 state 를 쓴다.

- `createOAuthState(data, secret, ttlMs)`: `payload = base64url(JSON({ ...data, exp: now+ttl }))`, `sig = hmacSign(payload, secret)` → `"{payload}.{sig}"`.
- `hmacSign`: WebCrypto `HMAC`/`SHA-256` → base64url. `hmacVerify`: 재계산 후 **길이 가드 + `timingSafeEqual`**(타이밍 공격 방지).
- `verifyOAuthState<T>(state, secret)`: 첫 `.` 기준 분리 → 서명 검증 실패/포맷 오류/`exp` 경과 시 `Error` throw → 성공 시 payload 반환.
- `parseStatePayload<T>(state)`: **서명 검증 없이** payload 만 디코드(콜백에서 redirect 값을 먼저 읽는 용도), 실패 시 `null`.

### 재사용 (mail · spotify)

`service/domain/mail/mail-oauth-connect.ts` 와 `service/domain/spotify/spotify-oauth-connect.ts` 가 동일 패턴:

- state payload = `{ userId, redirect }`(+ `exp`), `secret = env.BETTER_AUTH_SECRET`(better-auth 시크릿 재사용), `STATE_TTL_MS = 10분`.
- `generateAuthUrl`: `redirect` 는 `isAllowedRedirect`(§8) 통과분만 넣어 서명.
- `handleCallback`: `verifyOAuthState` 실패 시 각각 `MAIL_OAUTH_STATE_INVALID` / `SPOTIFY_OAUTH_STATE_INVALID`(400). 추가로 **`stateData.userId !== 세션 userId` 면 동일 에러**(로그인 사용자와 연결 대상 일치 강제).

---

## 8. URL 검증 (`lib/url-validator.ts`) · 민감정보 필터 (`lib/sensitive-filter.ts`)

### 8.1 `url-validator` — SSRF · 오픈리다이렉트 방어

- `isPublicUrl(url)` — **SSRF 가드**. `https:` 만 허용, `localhost`/`0.0.0.0`/`[::1]` 차단, 사설/링크로컬 IP 대역 정규식 차단(`127.`·`10.`·`172.16~31.`·`192.168.`·`0.`·`169.254.`·`::1`·`fc00:`·`fe80:`·`fd`). **사용처: `service/shared/icon-loader.ts`**(badge 가 외부 아이콘 URL 을 fetch 하기 전 게이트).
- `isAllowedRedirect(url)` — **오픈리다이렉트 가드**. 상대경로(`/` 로 시작, `//` 아님)는 허용, 그 외에는 `http`/`https` + 호스트가 `gumyo.net`/`hyns.dev` 이거나 그 서브도메인(`.gumyo.net`/`.hyns.dev`)일 때만 허용. **사용처: mail·spotify OAuth connect**(`route/mail/account.ts`·`route/spotify/account.ts` 와 각 connect 서비스)에서 콜백 후 `redirect` 대상 검증, 불통과 시 `baseUrl` 로 폴백.

### 8.2 `sensitive-filter` — 키 기반 레닥션

- `SENSITIVE_KEYS`(`password`/`token`/`secret`/`authorization`/`api_key`/`access_token`/`refresh_token`/`credential` 등)를 부분일치(`includes`, 소문자)로 판정하는 `isSensitiveKey(key)`, 그리고 매칭 값을 `'[REDACTED]'` 로 치환하는 `filterSensitiveData(record)`.
- **함정: 정의·유닛테스트만 있고 현재 런타임 소비처가 없다**(전수 grep 확인). 로그/디버그 출력에 민감값 마스킹을 붙일 때 쓸 예비 유틸.

---

## 9. 어드민 가드 (`page/admin/guard.ts`)

어드민 SSR(`page/`)은 API 와 별도 가드 `requireAdminPage(getSession)` 를 쓴다(리다이렉트/HTML 응답이 API 의 JSON 에러와 다르기 때문).

- **미인증**: `/admin/login?next=<현재 pathname+search 인코딩>` 로 **303 리다이렉트**.
- **비관리자**(`role !== 'admin'`): `renderForbidden` 이 **403 HTML** 렌더(이메일은 `escapeHtml` 로 이스케이프). "홈으로" 링크만.
- 통과 시 `c.set('adminUser', session.user)`. 타입은 `AdminContext.Variables.adminUser`(`AdminSessionUser`).
- 적용: `app.use('*', requireAdminPage(deps.getSession))` 형태로 어드민 대시보드(`page/admin/dashboard.tsx`) 및 `page/admin/pages/*` 전 모듈에 개별 장착.
- API 측 어드민 게이팅은 §4.1 의 `withAdmin` HOF / 로컬 `requireAdmin` 클로저가 담당(경로별 JSON 401/403).

---

## 10. 인접 보안 미들웨어 (CORS · 보안 헤더)

전역 미들웨어 조립은 `middleware/index.ts`(`createMiddleware`), 실인자는 `index.ts` 부트스트랩에서 주입.

- **CORS**(`/api/*`): `origin` 은 `isAllowedOrigin(origin, allowedDomains)` 통과 시 그대로 반사, 아니면 빈 문자열. `allowedDomains = ['gumyo.net', 'hyns.dev']`(호스트 일치 또는 서브도메인), 비프로덕션에선 `localhost` 도 허용. `credentials: true`.
- **보안 헤더**(`middleware/security-headers.ts`, `*` 적용): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`(제외경로 아닐 때), `X-XSS-Protection`, `Strict-Transport-Security`(1년, includeSubDomains), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, 그리고 CSP — HTML 경로(`htmlPaths`)는 `HTML_CSP`, 그 외는 극도로 제한적인 `API_CSP`(`default-src 'none'`).
  - `index.ts` 실인자: `securityExcludePaths = ['/api/spotify/playing', '/caldav/', '/.well-known/caldav']`(위젯 임베드·CalDAV 는 프레임/CSP 제외), `securityExcludeExactPaths = ['/', '/policy']`, `securityHtmlPaths = ['/admin']`.

### 함정 — 도메인 allowlist 3종이 서로 다르다

| 목적 | 파일 | 허용 도메인 |
|------|------|-------------|
| better-auth trustedOrigins | `service/shared/auth-provider.ts` | `*.gumyo.net`·`*.hyns.dev`·`*.seok.dev`(+env) |
| CORS allowedDomains | `index.ts` | `gumyo.net`·`hyns.dev`(+비프로덕션 localhost) |
| 리다이렉트 ALLOWED_DOMAINS | `lib/url-validator.ts` | `gumyo.net`·`hyns.dev` |

- `seok.dev` 는 **better-auth 만** 신뢰. CORS·리다이렉트 allowlist 에는 없다. 세 목록은 각각 수정해야 하며 자동 동기화되지 않는다.

---

## 11. 관련 환경변수 (`lib/env.ts`)

전부 `.optional()`(부재 시 각 조립부에서 빈 문자열/기본값 폴백):

- `BASE_URL` — better-auth baseURL·OAuth 콜백 URL 기준.
- `BETTER_AUTH_SECRET` — 세션 서명 + **OAuth connect HMAC state 서명 재사용**(§7).
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — 소셜 로그인 + Gmail/Drive 스코프.
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — spotify 계정 연결 OAuth.
- `TRUSTED_ORIGINS` — 콤마 구분, better-auth trustedOrigins 에 병합.

---

## 12. 에러 코드 (`lib/error-code.ts` · `error-message.ts` · `error.ts`)

인증·보안 횡단에서 던지는 코드와 상태:

| 코드 | 상태 | 사용 |
|------|------|------|
| `UNAUTHORIZED` | 401 | 세션 없음(`withAuth`/`withAdmin`/`requireAuth`/로컬 requireAdmin) |
| `FORBIDDEN` | 403 | 세션은 있으나 비관리자 |
| `RATE_LIMIT_EXCEEDED` | 429 | `withRateLimit` 초과(mail·ai, §6.3) |
| `API_TOKEN_INVALID` | 401 | `withApiToken`/`requireApiToken`(§4.3 미연결) |
| `WEATHER_KEY_INVALID` / `WEATHER_KEY_RATE_LIMIT` | 401 / 429 | weather 키 |
| `SPOTIFY_KEY_INVALID` | 401 | spotify API 키(`X-Spotify-Key`) |
| `SPOTIFY_WIDGET_TOKEN_NOT_FOUND` / `SPOTIFY_WIDGET_TOKEN_INACTIVE` | 404 / 403 | 위젯 토큰 미존재/비활성 |
| `MAIL_OAUTH_STATE_INVALID` / `SPOTIFY_OAUTH_STATE_INVALID` | 400 | HMAC state 위조/만료/사용자 불일치 |
| `LOG_DEVICE_KEY_INVALID` / `LOG_DEVICE_KEY_RATE_LIMIT` | 401 / 429 | 디바이스 키([../logging.md](../logging.md)) |

새 코드는 반드시 3파일(코드·메시지·상태)에 동시 추가한다.

---

## 13. 테스트

`bun test` 기준, 이 문서 소유 영역의 테스트 파일:

- 미들웨어: `tests/middleware/require-auth.test.ts`, `tests/middleware/require-admin.test.ts`, `tests/middleware/require-api-token.test.ts`
- HOF/유틸: `tests/lib/with-auth.test.ts`, `tests/lib/with-rate-limit.test.ts`, `tests/lib/rate-limit.test.ts`, `tests/lib/hmac-state.test.ts`, `tests/lib/token-utils.test.ts`, `tests/lib/url-validator.test.ts`, `tests/lib/sensitive-filter.test.ts`, `tests/lib/with-spotify-auth.test.ts`
- 서비스/라우트: `tests/service/shared/api-token.test.ts`, `tests/route/auth/oauth.test.ts`, `tests/route/auth/token.test.ts`

> `require-admin`·`require-api-token` 미들웨어는 런타임 미연결(§4.3)이지만 각각 전용 테스트(`tests/middleware/require-admin.test.ts`·`require-api-token.test.ts`)가 있다(정의·테스트만). `withAdmin`·`withApiToken` HOF 는 `lib/with-auth.test.ts` 에서 함께 커버된다.

---

## 14. 함정 요약

- **미연결 가드**: `requireAuth`/`requireAdmin`/`requireApiToken` 미들웨어와 `withApiToken` HOF, `apiTokenService.validate` 는 정의·테스트만 됨. 현 런타임 인증은 전부 `getSession` 경유(§4.3).
- **API 토큰 반쪽**: 발급·관리(세션 보호)는 되지만 `X-API-Token` 헤더 인증 경로가 라우트에 안 붙어 있음.
- **레이트리밋은 인메모리·프로세스 로컬**: 서버리스에서 전역 보장 아님. mail 2개 + ai 3개 엔드포인트에 적용(§6.3).
- **도메인 allowlist 3종 불일치**: better-auth / CORS / 리다이렉트가 각각 다른 목록. `seok.dev` 는 better-auth 만(§10).
- **크로스서브도메인 쿠키는 프로덕션 + `.gumyo.net` 한정**(§2.1).
- **HMAC state 시크릿 = `BETTER_AUTH_SECRET` 재사용**: 이 값 부재/회전 시 세션과 OAuth connect state 가 동시에 영향(§7).
- **`sensitive-filter` 는 미소비 예비 유틸**: 실제 마스킹이 걸려 있다고 가정하지 말 것(§8.2).
