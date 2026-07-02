# 아키텍처 (Architecture)

> 기준: 2026-07-02 (dev @ `f6c65f3`) 코드 검증. 다루는 코드: `index.ts`, `compose/index.ts`·`compose/types.ts`·`compose/shared.ts`, `route/index.ts`, `middleware/*`, `lib/`(error-code·error-message·error·api-response·with-auth·with-error-handling·with-rate-limit·hono-types·env·log-service-name·sentry), `db/index.ts`, `page/index.ts`, `tsconfig.json`·`vercel.json`·`package.json`·`bunfig.toml`·`drizzle.config.ts`

Bun + Hono 단일 서비스. 하나의 `Hono` 앱을 부트스트랩(`index.ts`)에서 조립하고, 모든 도메인 의존성을 `compose()`로 한 번에 주입한다. 계층 경계는 **Route(HTTP) → Service(도메인) → ServiceDb(compose 의 Drizzle 구현)** 로 고정하며, Drizzle 쿼리는 `compose/` 에만 존재한다. 도메인별 엔드포인트·스키마·서비스 상세는 [domains/](./domains/) 와 [reference/](./reference/) 가 소유한다 — 이 문서는 전역 골격만 다룬다.

---

## 1. 부트스트랩 순서 (`index.ts`)

`index.ts` 는 아래 순서로 앱을 조립한다. 순서는 **compose → router → middleware → mount → (dev) docs** 로 고정.

| 단계 | 코드 | 내용 |
|------|------|------|
| ① 앱 생성 | `new Hono<AuthContext>()` | 컨텍스트 변수 계약(`AuthContext`, → §6) 적용 |
| ② DI 조립 | `const composed = compose()` | 전 도메인 서비스 조립 (→ §3) |
| ③ 라우터 조립 | `const { api, caldav } = createRouter(composed)` | `/api` 라우터 + CalDAV 라우터 분리 반환 |
| ④ 미들웨어 등록 | `createMiddleware(app, {...})` | 전역 체인 (→ §4) |
| ⑤ 페이지 mount | `app.route('', createPage({ admin }))` | 홈·policy·well-known·어드민 SSR |
| ⑥ API mount | `app.route('/api', api)` | 도메인 REST |
| ⑦ CalDAV mount | `app.route('/caldav', caldav)` | 캘린더 CalDAV |
| ⑧ (dev 전용) 문서 | `GET /docs`, `GET /swagger` | `NODE_ENV !== 'production'` 일 때만 |
| ⑨ export | `{ port: process.env.PORT || 9999, fetch: app.fetch }` | Bun fetch 핸들러 |

- `createMiddleware(app, ...)` 에 넘기는 실제 인자: `allowedDomains: ['gumyo.net', 'hyns.dev']`, `securityExcludePaths: ['/api/spotify/playing', '/caldav/', '/.well-known/caldav']`, `securityExcludeExactPaths: ['/', '/policy']`, `securityHtmlPaths: ['/admin']`, `logEventService: composed.logEventService`.
- `triggerMailSync(accountId)` 클로저를 만들어 어드민 페이지 의존성으로 주입(`createPage({ admin: { getSession, db, auth, triggerMailSync } })`). 계정 조회 후 `composed.mailSyncService.syncAccount` 호출.
- `/docs`: `generateSpecs(app, ...)` 로 OpenAPI 스펙 JSON 생성(title `Hyun Hub API`, servers `https://api.gumyo.net`·`http://localhost:9999`). `/swagger`: `swaggerUI({ url: '/docs' })`. **둘 다 비프로덕션에서만 등록**된다.

### 정적·홈·policy·well-known 서빙 (`page/index.ts`)

`createPage()` 가 하위 라우터를 합친다: `homeRoute`, `policyRoute`(`/policy`), `wellKnownRoute`, 그리고 `admin` 의존성이 있으면 `/admin` 어드민.

| 경로 | 파일 | 내용 |
|------|------|------|
| `GET /` | `page/home.tsx` | Hono JSX SSR 홈(gumyo.net 소개) |
| `GET /favicon.ico` | `page/home.tsx` | `public/favicon.ico` 바이트 서빙, `Cache-Control: public, max-age=86400` |
| `GET /policy` | `page/policy.tsx` | 개인정보처리방침 + 이용약관 SSR |
| `GET`/`PROPFIND /.well-known/caldav` 외 | `page/well-known.ts` | CalDAV 자동탐색 — Basic auth/`token` 쿼리에서 토큰 추출 후 `301 → /caldav/{token}/`, 실패 시 `401 WWW-Authenticate: Basic` |
| `GET /admin/*` | `page/admin/*` | SSR 어드민(CSR 없음). `/admin/styles.css` 는 디자인 토큰 CSS |

어드민 상세는 [admin-features.md](./admin-features.md), SSR 규약은 [hono-reference.md](./hono-reference.md) 참조.

---

## 2. 계층 다이어그램과 책임

```
요청
 │
 ▼
index.ts (부트스트랩)
 │
 ▼
middleware 전역 체인 (cors → securityHeaders → logCapture → errorHandler)
 │
 ▼
route/*  ── HTTP 경계: describeRoute + validator + HOF(withErrorHandling/withAuth…)
 │            null → createAppError, 응답 봉투(successResponse/paginatedResponse)
 ▼
service/domain/*  ── 도메인 로직 (HTTP·Drizzle 모름, DTO 입력 → 결과/null)
 │
 ▼
ServiceDb (compose/*.ts 내 인라인 Drizzle 구현)
 │
 ▼
db/index.ts (Drizzle + mysql2 pool) → MySQL
```

| 계층 | 위치 | 책임 | HTTP 인지 | Drizzle 인지 |
|------|------|------|:---------:|:------------:|
| Route | `route/` | DTO 검증, 인증/권한 HOF 합성, `null → createAppError`, 응답 직렬화 | O | X |
| Service (도메인) | `service/domain/` | 도메인 로직. 입력 DTO 타입 → 도메인 결과/`null` | X | X |
| Service (횡단) | `service/shared/` | auth-provider·storage·image-processor·api-token·cache·badge·gdrive 등 공용 서비스 | X | X |
| ServiceDb | `compose/*.ts` 내 인라인 | Service 에 주입되는 Drizzle 쿼리 구현체 | X | O |
| compose | `compose/` | Factory DI 조립 (→ §3) | X | O(주입 지점) |
| lib | `lib/` | 에러 3파일·응답 헬퍼·HOF·env·컨텍스트 타입 | 부분 | X |
| middleware | `middleware/` | 전역/경로 가드 | O | 일부 |
| db | `db/index.ts` | Drizzle 싱글톤 (mysql2 pool, `connectionLimit: 20`, mode `'default'`) | X | O |
| page | `page/` | 홈·policy·well-known·어드민 SSR JSX | O | 조회만 |

- "없음"은 Service 가 `null` 로 반환하고, `throw` 변환(`createAppError`)은 Route 가 담당한다.
- 계층 규약 상세는 백엔드 컨벤션 및 [guidelines/](./guidelines/) 참조.

---

## 3. compose DI 체계 (`compose/index.ts`)

`compose()` 는 **core → shared → domain** 순으로 조립하고, 결과를 스프레드로 평탄화해 단일 객체로 반환한다.

```
env = getEnv();  db = getDb();  core = { db, env }
shared = composeShared(core)
blog   = composeBlog({ ...core, storageService, imageProcessor })
weather/logs/spotify/resume/calendar = compose*(core)
mail   = composeMail({ ...core, storageService })
drive  = composeDrive({ ...core, storageService, imageProcessor, gdriveStorageService: null, initGdriveStorage })
ai     = composeAi({ ...core, storageService, logEventService })  // AI_ENCRYPTION_KEY 없으면 {} 반환(graceful)
return { ...shared, ...blog, ...weather, ...logs, ...mail, ...spotify, ...resume, ...calendar, ...drive, ...ai, baseUrl, gdriveRootFolderId }
```

- **`composeShared(core)`** 가 먼저 생성하는 공용 의존성: `auth`(better-auth), `getSession`(세션 정규화 어댑터), `apiTokenService`, `storageService`(R2/S3), `imageProcessor`(sharp), `imageGenerator`(satori+resvg), `fontLoader`, `badgeService`, `initGdriveStorage`, `getGdriveAccessToken`. 도메인 compose 는 core + 이 shared 산출물을 주입받는다.
- **스프레드 병합**: `composed.postService`·`composed.mailSyncService`·`composed.logEventService` 처럼 도메인 접두 없이 평탄한 키로 노출된다. `createRouter(composed)` 와 `createPage` 가 이 평탄 객체에서 필요한 서비스를 꺼내 쓴다.
- **`compose/types.ts`** 역할: 조립 인자 타입 정의. `Db = ReturnType<typeof getDb>`, `Env = ReturnType<typeof getEnv>`, `ComposeCoreArgs = { db, env }`, 그리고 도메인별 주입 요구를 표현하는 `ComposeBlogArgs`(+storage/imageProcessor), `ComposeMailArgs`(+storage), `ComposeDriveArgs`(+storage/imageProcessor/gdrive) 등. 각 도메인이 core 외에 무엇을 더 받는지 이 파일이 계약한다.
- **ServiceDb 인라인 구현**: 각 `compose/<domain>.ts` 가 도메인 ServiceDb 인터페이스를 Drizzle 로 구현해 `create*Service(...)` 에 주입한다. Service 는 순수 로직, 쿼리는 조립부에 격리. (도메인별 조립 상세는 [domains/](./domains/))

---

## 4. 요청 라이프사이클

### 전역 미들웨어 체인 (`middleware/index.ts` 등록 순서)

`createMiddleware(app, deps)` 가 아래 순서로 `app.use` 를 호출한다(양파(onion) 모델 — 요청은 위→아래, 응답은 역순).

| 순서 | 미들웨어 | 스코프 | 동작 |
|:---:|----------|--------|------|
| 1 | `cors` | `/api/*` | origin 허용목록 검사(`gumyo.net`·`hyns.dev` 및 하위도메인, dev 는 `localhost`), `credentials: true` |
| 2 | `securityHeaders` | `*` | `next()` 후 보안 헤더 주입. CSP 는 API(`API_CSP`) vs HTML(`HTML_CSP`, `htmlPaths`) 분기, `excludePaths`/`excludeExactPaths` 는 `X-Frame-Options`·CSP 생략 |
| 3 | `logCapture` | `*` | `logEventService` 존재 시만 등록. `next()` 후 status ≥ 400 이면 `captureServerError` 로 자동 캡처(`/api/logs` 는 제외) |
| 4 | `errorHandler` | `*` | `try { next() } catch` — 전역 안전망(→ §5) |

- `cors` 는 `/api/*` 에만, 나머지 3개는 `*` 전역.
- `middleware/` 에는 이 체인 밖에서 라우트가 직접 쓰는 가드도 있다: `require-weather-key`(weather 데이터), `require-device-key`(logs 수집). `require-auth`·`require-admin`·`require-api-token`·`request-logger` 는 정의·테스트만 되어 있고 **현재 부트스트랩/라우트 와이어링에는 미사용**(라우트 인증은 §7 의 HOF 로 처리).

### 라우트 HOF 합성 순서

라우트 핸들러는 HOF 를 **바깥 `withErrorHandling` → 안쪽 인증/제한** 순으로 감싼다.

```
withErrorHandling(
  withAuth({ getSession })(
    withRateLimit({ checkLimit })(   // 메일 발송·증분 동기화 라우트에만
      async (c, user) => { ... }
    )
  )
)
```

- `withAuth`/`withAdmin` 이 던지는 `UNAUTHORIZED`/`FORBIDDEN` 도 바깥 `withErrorHandling` 이 잡아 응답 봉투로 변환하도록 순서를 고정.
- `withRateLimit` 은 인증된 핸들러를 감싸 `X-RateLimit-Limit`/`-Remaining`/`-Reset` 헤더를 붙이고 초과 시 `RATE_LIMIT_EXCEEDED`.

### 응답 봉투 (`lib/api-response.ts`)

- `successResponse(data)` → `{ success: true, data }`
- `paginatedResponse(data, { page, limit, total })` → `totalPages` 자동 계산(`Math.ceil(total/limit)`)
- `errorResponse(code, message, details?)` → `{ success: false, error: { code, message, details? } }`. **`details` 는 비프로덕션에서만** 직렬화.

---

## 5. 에러 3파일 체계와 에러 흐름

에러는 3파일로 중앙화한다.

| 파일 | 책임 |
|------|------|
| `lib/error-code.ts` | `ERROR_CODE` 상수 객체 + `ErrorCode` union 타입 (도메인 접두: `BLOG_*`·`MAIL_*`·`WEATHER_*`·`CALENDAR_*`·`DRIVE_*`·`SPOTIFY_*`·`RESUME_*`·`BADGE_*`·`LOG_*`·`AI_*` + 공통·`STORAGE_*`/`IMAGE_*` 등 인프라) |
| `lib/error-message.ts` | `ERROR_MESSAGE: Record<ErrorCode, string>` (한국어 메시지, 코드 전수 대응) |
| `lib/error.ts` | `AppError` 타입, `STATUS_MAP`, `getStatusCode`(미매핑 시 500), `createAppError`, `isAppError` |

### 흐름

```
서비스/라우트: throw createAppError('CODE'[, details])
        │
        ▼
withErrorHandling (라우트) 또는 errorHandler (전역 미들웨어) 가 catch
        │
   isAppError(error)?
   ├─ 예:  c.set('errorCode', code)  → errorResponse(code, message, details) @ statusCode
   └─ 아니오: c.set('errorDetail', safeMessage) → captureException(Sentry) → errorResponse('INTERNAL_ERROR') @ 500
        │
        ▼
logCapture 미들웨어: status ≥ 400 이면 c.get('errorCode')/('errorDetail') 를 읽어
        logEventService.captureServerError(...) 로 log_events 자동 적재 (/api/logs 제외)
```

- `withErrorHandling`(라우트 핸들러 래퍼)과 `errorHandler`(전역 미들웨어)는 거의 동일한 로직 — 전자는 감싼 핸들러의 에러를, 후자는 그 밖(미들웨어·비래핑 경로)의 에러를 잡는 이중 안전망. 둘 다 `errorCode`/`errorDetail` 컨텍스트 변수를 세팅해 `logCapture` 가 캡처할 수 있게 한다.
- `logCapture` 의 서비스명/심각도/코드 산출은 `lib/log-service-name.ts`(`serviceNameFromPath`, `severityFromStatus`=500↑→40/그외 30, `errorCodeFromStatus`). `details` 에 `path`/`method`/`status`/`durationMs` 포함, `errorDescription` 은 2000자 컷.
- `captureException` 은 `lib/sentry.ts` 소속. 전송은 `sentryInitialized` 가 true 일 때만 일어나는데, 이를 켜는 `initSentry(SENTRY_DSN)` 는 **현재 앱 부트스트랩 어디에서도 호출되지 않는다**(테스트에서만 호출) → `SENTRY_DSN` 설정 여부와 무관하게 `captureException` 은 사실상 항상 no-op(Sentry 비활성). 미매핑 에러의 개발 모드 스택 출력은 `withErrorHandling`/`errorHandler` 의 `console.error` 가 담당한다.
- 로깅 시스템 상세는 [logging.md](./logging.md), 펌웨어 계약은 [firmware-logging-contract.md](./firmware-logging-contract.md).

---

## 6. 컨텍스트 변수 계약 (`lib/hono-types.ts`)

```ts
HonoVariables = { user: AuthUser; errorCode: string; errorDetail: string }
AuthContext   = { Variables: HonoVariables }
AuthUser      = { id; name; email; role: string | null; image: string | null }
```

- 최상위 `new Hono<AuthContext>()` 가 이 계약을 적용한다.
- **`user`**: `requireAdmin`/`requireApiToken`/`requireWeatherKey`(+`requireWeatherKeyNoLog`) 미들웨어가 `c.set('user', ...)` 로 채운다 — 단 이 중 실제 라우트에 와이어된 것은 `requireWeatherKey(NoLog)`(weather 데이터 라우트)뿐이고 `requireAdmin`·`requireApiToken` 은 미와이어(§4·§7). 반면 라우트 HOF(`withAuth`/`withAdmin`)는 컨텍스트에 세팅하지 않고 핸들러 2번째 인자(`(c, user)`)로 직접 전달한다. `requireDeviceKey` 는 `user` 를 세팅하지 않는다(`deviceKeyId` 등만).
- **`errorCode`/`errorDetail`**: `withErrorHandling`·`errorHandler` 가 세팅하고 `logCapture`·`require-weather-key` 로깅부가 읽는다. `logCapture` 는 `readVar`(try/catch)로 안전하게 조회.
- 계약 밖 임시 변수(`deviceKeyId`·`weatherKeyId`·`weatherKeyUserId` 등)는 `c.set('...' as never, ... as never)` 로 우회 세팅된다(도메인 미들웨어 내부용).

---

## 7. 인증 방식 총람

라우트 인증의 기본은 HOF(`lib/with-auth.ts`)이고, 도메인 키/디바이스 인증은 라우트가 직접 다는 미들웨어다. 상세·발급 흐름은 [domains/auth.md](./domains/auth.md).

| 방식 | 전달 | 구현 파일 | 적용 위치 | 비고 |
|------|------|-----------|-----------|------|
| 세션(better-auth) | 쿠키 | `getSession`(`compose/shared.ts`) + `withAuth`(`lib/with-auth.ts`) | 대부분 `/api` 라우트 | GitHub/Google OAuth, `role` 포함 정규화 |
| 어드민 | 세션 + `role==='admin'` | `withAdmin`(`lib/with-auth.ts`); `requireAdminPage`(`page/admin/guard.ts`) | logs 관리(목록/purge/resolve), weather 키 한도 수정(`PATCH /:id/limit`), `/admin` SSR | blog tag/category/admin 은 라우트 내부 로컬 `requireAdmin` 헬퍼 사용. weather 키 목록/발급/삭제는 `withAdmin` 이 아니라 `withAuth`(일반 세션) |
| API 토큰 | `X-API-Token` 헤더 | `withApiToken`(`lib/with-auth.ts`) / `require-api-token.ts` | 없음(미적용) | `withApiToken` HOF·`require-api-token.ts` 미들웨어 **모두** 정의·테스트만, 라우트 미와이어 |
| 디바이스 키 | `X-Device-Key` 헤더 | `requireDeviceKey`(`middleware/require-device-key.ts`) | `POST /api/logs`·`POST /api/logs/batch` 수집 | `validate` + 일일 `checkRateLimit`(`deviceId` 키). `deviceKeyId` 만 세팅, `user` 미세팅 |
| weather 키 | `X-Weather-Key` 헤더 | `requireWeatherKey`/`requireWeatherKeyNoLog`(`middleware/require-weather-key.ts`) | `/api/weather` 데이터 라우트 | rate limit + 요청 로깅(`logRequest`) |
| spotify 위젯 토큰 | path `:token` | `spotifyWidgetTokenService.validate`(`route/spotify/playing.ts`) | `/api/spotify/playing/:token*` | 세션 없이 공개, `security` 헤더 제외 경로 |
| rate limit | `user.id` | `withRateLimit`(`lib/with-rate-limit.ts`) | 메일 발송(`POST /api/mail/messages/send`)·증분 동기화(`POST /api/mail/sync`)만 | `X-RateLimit-*` 헤더 응답. `compose/mail.ts` 의 `mailRateLimiter`(60초/20회) |

- `getSession` 어댑터: `auth.api.getSession({ headers })` 결과를 `{ user: { id, name, email, role, image } }` 로 정규화. Route/HOF 는 이 정규화된 형태만 의존한다.
- 미구성 서비스 방어: `createRouter` 가 각 의존성을 `stub()`(Proxy)/`stubFn()` 로 감싸, 미주입 서비스 호출 시 `SERVICE_NOT_CONFIGURED`(503) 를 던진다. 일부 서비스가 빠져도 나머지 라우트는 동작.

---

## 8. 빌드·실행 명령과 `vercel.json`

### 명령 (`package.json` scripts)

| 명령 | 실제 커맨드 | 용도 |
|------|-------------|------|
| `bun run dev` | `bun run --hot index.ts` | 핫리로드 개발 서버(기본 포트 9999) |
| `bun run build` | `bun build ./index.ts --outfile ./api/index.js --target bun --format esm` | 단일 함수 번들 |
| `bun run vercel-build` | build + `--external @google/genai --external cheerio` | Vercel 빌드(무거운 의존성 외부화) |
| `bun test` | `bun test` | 테스트(루트 `./tests`, `bunfig.toml`) |
| `bun run typecheck` | `tsc --noEmit` | 타입체크(`tests`·`dist`·`api`·`drizzle` 제외) |
| `bun run db:generate` | `drizzle-kit generate` | 스키마 diff DDL 미리보기 — 산출물 gitignored·미커밋, `db:push` 전 검증용([guidelines/db-schema-change.md](./guidelines/db-schema-change.md)) |
| `bun run db:push` | `drizzle-kit push` | **스키마 직접 반영**(마이그레이션 파일 없음, `drizzle/` gitignored) |
| `bun run db:studio` | `drizzle-kit studio` | Drizzle Studio |

- DB 반영은 마이그레이션 파일이 아니라 `db:push` 로 한다. `drizzle.config.ts`: `schema: './db/schema.ts'`, `out: './drizzle'`, `dialect: 'mysql'`, `url: DATABASE_URL`.
- 환경변수는 `getEnv()`(`lib/env.ts`, Zod `safeParse` + 캐시)로만 접근. `DATABASE_URL` 만 필수, 나머지는 `optional`. 목록은 [reference/](./reference/) 참조.

### `vercel.json`

| 키 | 값 | 의미 |
|----|-----|------|
| `bunVersion` | `1.x` | Bun 런타임 |
| `buildCommand` | `bun run vercel-build` | `index.ts` → `api/index.js` 단일 번들 |
| `rewrites` | `/(.*) → /api` | **모든 경로를 단일 서버리스 함수(`api/index.js`)로** 라우팅(라우팅은 앱 내부 Hono 가 담당) |
| `crons` | `/api/drive/lifecycle/evict-r2` `0 3 * * *`, `/api/drive/lifecycle/auto-promote` `0 5 * * *` | drive 스토리지 계층 관리 크론 |

- 전 요청이 하나의 함수로 들어와 앱 내부에서 `/api`·`/caldav`·페이지로 분기된다.
- 배포 파이프라인·`deploy/`(caldav-proxy·upload-server) Docker 서비스 상세는 [deploy.md](./deploy.md), 테스트 구조는 [testing.md](./testing.md).
