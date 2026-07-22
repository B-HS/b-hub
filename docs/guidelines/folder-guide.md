# 폴더별 작업 지침 (Folder Guide)

> 기준: 2026-07-09 (vercel 배포 계약 @ `09e13e1`) 코드 검증. 다루는 코드: `index.ts`, `api/index.js`, `package.json`, `tsconfig.json`, `vercel.json`, `bunfig.toml`, `drizzle.config.ts`, `prettier.config.cjs`, `.gitignore`, `route/index.ts`·`route/health.ts`·`route/resume/resume.ts`, `dto/resume/resume.ts`·`dto/common.ts`·`dto/error-response.ts`, `service/domain/resume/resume.ts`·`service/shared/api-token.ts`, `compose/index.ts`·`compose/types.ts`·`compose/resume.ts`·`compose/shared.ts`, `db/index.ts`·`db/schema.ts`, `middleware/index.ts`, `page/index.ts`·`page/admin/db.ts`, `masterdata/locations.json`, `scripts/backfill-thread-id.ts`, `deploy/**`, `tests/**`

이 문서는 **최상위 폴더·루트 설정 파일별 "여기에 무엇을 두고, 어떻게 쓰고, 바꿀 때 무엇을 함께 손대나"의 정본**이다. 각 폴더의 전수 인벤토리(테이블·엔드포인트·env·유틸 목록)와 도메인 로직은 [reference/](../reference/) 와 [domains/](../domains/) 가 소유하므로 여기서 재나열하지 않고 링크한다. 계층 경계·부트스트랩·불변 규칙은 [architecture.md](../architecture.md) 와 [memory/stack-and-invariants.md](../memory/stack-and-invariants.md) 가 정본이다.

---

## 폴더 → 담당 문서 총람

| 폴더 / 파일 | 역할(1줄) | 상세 정본 |
|------|-----------|-----------|
| `route/` | HTTP 경계 (검증·인증·에러 throw·응답 봉투) | [reference/api-endpoints.md](../reference/api-endpoints.md), [domains/](../domains/) |
| `dto/` | Zod 스키마 (요청 검증 + 타입 유도 + OpenAPI) | [testing.md](../testing.md) §4.1, [domains/](../domains/) |
| `service/domain/` | 도메인 로직 (HTTP·Drizzle 모름) | [domains/](../domains/) |
| `service/shared/` | 횡단 서비스 (auth·storage·image·cache 등) | [reference/shared-services.md](../reference/shared-services.md) |
| `compose/` | Factory DI 조립 + ServiceDb 인라인 Drizzle 구현 | [architecture.md](../architecture.md) §3, [reference/shared-services.md](../reference/shared-services.md) |
| `db/` | Drizzle 스키마(`schema.ts`) + 풀 싱글톤(`index.ts`) | [reference/db-schema.md](../reference/db-schema.md) |
| `lib/` | 순수 유틸 + 코어(에러 3파일·응답 헬퍼·HOF·env) | [reference/lib-utilities.md](../reference/lib-utilities.md) |
| `middleware/` | 전역 체인 + 경로 가드(`require-*`) | [architecture.md](../architecture.md) §4, [domains/auth.md](../domains/auth.md) |
| `page/` | 홈·policy·well-known·어드민 SSR JSX (CSR 없음) | [hono-reference.md](../hono-reference.md), [admin-features.md](../admin-features.md) |
| `masterdata/` | 정적 데이터 JSON | [domains/weather.md](../domains/weather.md) |
| `public/` | 정적 에셋(favicon·아이콘) | [reference/shared-services.md](../reference/shared-services.md)(icon-loader) |
| `scripts/` | 일회성/운영 CLI 스크립트 | [utils/index.md](../utils/index.md) |
| `tests/` | `bun test` — 소스 미러 구조 | [testing.md](../testing.md) |
| `deploy/` | 별도 Docker 서비스 2개(caldav-proxy·upload-server) | [deploy.md](../deploy.md) §4·§5 |
| `docs/` | 문서(분류·읽기 순서) | [index.md](../index.md), [acknowledge/2026-07-02-docs-structure.md](../acknowledge/2026-07-02-docs-structure.md) |
| `index.ts` | 부트스트랩(compose→router→middleware→mount) | [architecture.md](../architecture.md) §1 |
| `package.json` | 명령·의존성 | [architecture.md](../architecture.md) §8 |
| `tsconfig.json` | 컴파일러 설정(hono/jsx) | [hono-reference.md](../hono-reference.md) §1 |
| `vercel.json` | 배포·rewrite·cron | [deploy.md](../deploy.md) §1, [architecture.md](../architecture.md) §8 |
| `bunfig.toml` | 테스트 root | [testing.md](../testing.md) |
| `drizzle.config.ts` | db:push 설정 | [reference/db-schema.md](../reference/db-schema.md) |
| `prettier.config.cjs` | 포맷(feconfig-bhs) | [memory/stack-and-invariants.md](../memory/stack-and-invariants.md) |

> **한 도메인 = 4곳 대응.** 도메인 하나를 추가/수정하면 `dto/<도메인>` → `service/domain/<도메인>` → `compose/<도메인>.ts`(+`compose/types.ts`·`compose/index.ts`) → `route/<도메인>`(+`route/index.ts`) 이 함께 움직인다. 각 폴더 체크리스트가 이 연쇄를 나눠 담는다.

---

## 루트 설정 파일

### `index.ts` — 부트스트랩

- **역할**: 단일 `Hono<AuthContext>` 앱 진입점. 조립 순서 `compose()` → `createRouter(composed)` → `createMiddleware(app, ...)` → `app.route('', createPage(...))` → `app.route('/api', api)` → `app.route('/caldav', caldav)` → (비프로덕션) `/docs`·`/swagger`.
- **배치 규칙**: 여기엔 조립·mount·export(`{ port: process.env.PORT || 9999, fetch: app.fetch }`)만 둔다. 도메인 로직·라우트 정의·Drizzle 쿼리 금지. `triggerMailSync` 같은 조립용 클로저는 여기서 만들어 `createPage` 에 주입한다.
- **작성 컨벤션**: `createMiddleware` 인자(`allowedDomains`·`securityExcludePaths`·`securityExcludeExactPaths`·`securityHtmlPaths`·`logEventService`)로 전역 정책을 설정한다. 새 공개/보안예외 경로가 생기면 이 배열을 수정한다.
- **변경 체크리스트**
  - [ ] 새 최상위 mount(`/api` 밖 경로)는 `createPage` 또는 별도 `app.route` 로만 추가
  - [ ] 보안헤더 예외·HTML 경로 변경 시 `securityExclude*Paths`/`securityHtmlPaths` 갱신 후 [architecture.md](../architecture.md) §4 대조
  - [ ] 부트스트랩 순서·mount 변경 시 [architecture.md](../architecture.md) §1 갱신
- **참조**: [architecture.md](../architecture.md) §1

### `package.json`

- **역할**: 프로젝트 메타(`name: hyun-hub`) + 스크립트(`dev`·`build`·`vercel-build`·`test`·`typecheck`·`test:coverage`·`db:generate`·`db:push`·`db:studio`) + 의존성.
- **배치 규칙**: 런타임은 Bun 고정. 의존성 추가 전 `lib/`·`service/shared/` 기존 유틸로 되는지 먼저 확인([reference/lib-utilities.md](../reference/lib-utilities.md) "중복 구현 금지").
- **작성 컨벤션**: `vercel-build` 는 `build` + `--external @google/genai --external cheerio`(무거운 의존성 번들 제외). 스크립트 신설 시 명령 표([architecture.md](../architecture.md) §8) 동기화.
- **변경 체크리스트**
  - [ ] 의존성 추가 시 `bun install`(npm/pnpm 금지), 버전은 최신 + 필요 근거
  - [ ] 스크립트 추가/변경 시 [architecture.md](../architecture.md) §8 명령 표 갱신
  - [ ] 무거운 런타임 의존성이면 `vercel-build` `--external` 검토
- **참조**: [architecture.md](../architecture.md) §8, [deploy.md](../deploy.md) §1

### `tsconfig.json`

- **역할**: 컴파일러 설정. `jsx: react-jsx` + `jsxImportSource: hono/jsx`(어드민 SSR JSX), `strict`, `types: [bun-types]`.
- **배치 규칙**: `include: **/*.ts` + `exclude: [node_modules, tests, dist, api, drizzle]` — `exclude` 에 `tests` 가 있어 `tsc --noEmit` 은 **소스만** 타입체크한다(테스트 전용 tsconfig 없음 → 테스트는 tsc 대상 아님, `bun test` 로만 실행). `api`/`drizzle`/`dist` 는 빌드 산출물이라 제외(`api/index.js` 셔임은 커밋되지만 JS 라 tsc 대상 아님).
- **변경 체크리스트**
  - [ ] JSX 관련 옵션 변경 시 [hono-reference.md](../hono-reference.md) §1 갱신 (React 아님, `hono/jsx`)
  - [ ] `exclude` 변경 시 타입체크 범위 영향 확인(`bunx tsc --noEmit`)
- **참조**: [hono-reference.md](../hono-reference.md) §1

### `vercel.json`

- **역할**: 배포 정의. `bunVersion: 1.x`, **`framework: null`(hono 자동 감지 차단 — 제거 금지)**, `buildCommand: bun run vercel-build`, `rewrites: /(.*) → /api`(전 요청을 단일 함수로), `crons` 2개.
- **배치 규칙**: 라우팅은 앱 내부 Hono 가 담당하므로 경로별 rewrite 를 늘리지 않는다(단일 `/api` 유지). cron 대상은 실제 `route/drive/lifecycle.ts` 핸들러와 경로가 일치해야 한다. `framework: null` 은 커밋된 셔임 `api/index.js` 와 한 세트다([bug/2026-07-09](../bug/2026-07-09-vercel-hono-detection-crash.md) — 2026-07 production 장애의 재발 방지 계약).
- **변경 체크리스트**
  - [ ] cron 추가/변경 시 대응 라우트(현재 `route/drive/lifecycle.ts`) 존재·인증(`verifyCronAuth`) 확인
  - [ ] cron 표를 [deploy.md](../deploy.md) §1·[reference/api-endpoints.md](../reference/api-endpoints.md) "Vercel cron" 과 동기화
  - [ ] `framework`·`buildCommand` 를 건드리면 fresh-clone 조건(`rm api/hub.js` 후 `bunx vercel build`)으로 함수 생성 여부 재검증
- **참조**: [deploy.md](../deploy.md) §1, [architecture.md](../architecture.md) §8

### `api/` — Vercel 함수 엔트리

- **역할**: `api/index.js`(커밋, `export { default } from './hub.js'` 1줄 셔임) + `api/hub.js`(gitignored, `vercel-build` 가 생성하는 자가 번들). 새 Vercel 빌더가 함수를 클론 시점 소스에서 열거하므로 커밋된 셔임이 함수 엔트리가 되고, 빌드 시 번들을 re-export 한다.
- **배치 규칙**: 셔임은 JS 유지(`.ts` 금지 — 빌더 tsc 의 `.js`→`.ts` 매핑으로 타입에러) + 번들(`./hub.js`)만 가리킨다(소스 지향 금지 — 트레이싱 크래시 재발). 앱 코드를 이 폴더에 두지 않는다.
- **참조**: [deploy.md](../deploy.md) §1, [bug/2026-07-09-vercel-hono-detection-crash.md](../bug/2026-07-09-vercel-hono-detection-crash.md)

### `bunfig.toml`

- **역할**: `[test] root = "./tests"` — 테스트 루트 고정. preload/setup 없음.
- **변경 체크리스트**
  - [ ] 테스트 root 변경 시 [testing.md](../testing.md) §1 갱신
- **참조**: [testing.md](../testing.md)

### `drizzle.config.ts`

- **역할**: `db:push`/`db:generate`/`db:studio` 설정. `schema: ./db/schema.ts`, `out: ./drizzle`, `dialect: mysql`, `dbCredentials.url: DATABASE_URL`(`process.env` 직접).
- **배치 규칙**: `out: ./drizzle` 은 `.gitignore` 대상(마이그레이션 파일 커밋 안 함). 스키마 반영은 `bun run db:push`.
- **변경 체크리스트**
  - [ ] `schema` 경로 변경 시 [reference/db-schema.md](../reference/db-schema.md) 갱신
- **참조**: [reference/db-schema.md](../reference/db-schema.md), [deploy.md](../deploy.md) §3

### `prettier.config.cjs`

- **역할**: `feconfig-bhs/prettier.config.js` 확장(4-space·no semi·single quote·printWidth 150).
- **변경 체크리스트**
  - [ ] 포맷 규칙은 `feconfig-bhs` 를 따르고 임의 오버라이드 지양
- **참조**: [memory/stack-and-invariants.md](../memory/stack-and-invariants.md)

---

## `route/`

- **역할**: HTTP 경계. DTO 검증·인증(HOF/미들웨어)·`null → createAppError` 변환·응답 봉투 직렬화. Drizzle 를 모른다.
- **배치 규칙**: 도메인별 하위 폴더(`ai`·`auth`·`blog`·`calendar`·`drive`·`logs`·`mail`·`resume`·`spotify`·`weather`) + 최상위 단일 라우트(`badge.ts`·`health.ts`) + 조립부(`index.ts`). 비즈니스 로직·DB 쿼리 금지 — 그건 `service/`·`compose/`. 검증 스키마는 여기 두지 않고 `dto/` 에서 import.
- **작성 컨벤션** (근거: `route/resume/resume.ts`, `route/index.ts`)
  - 팩토리 `createXxxRoute(deps) => new Hono()`. `deps` 는 서비스 + `getSession`(필요 시) 타입.
  - 각 핸들러 = `describeRoute({ tags, summary, responses: { 200, ...errorResponses([...ErrorCode]) } })` + `validator('query'|'json', zSchema)` + `withErrorHandling(async (c) => ...)`.
  - 검증값은 `c.req.valid('query' as never) as z.infer<typeof schema>` 로 꺼낸다.
  - "없음/실패"는 서비스가 `null`/`{success:false}` 로 주고, 라우트가 `throw createAppError('CODE')` 로 변환.
  - 응답은 `successResponse`/`paginatedResponse`(`lib/api-response.ts`)로만.
  - 새 라우트 팩토리는 `route/index.ts` `createRouter` 에 `router.route('/prefix', createXxxRoute({ ...: stub(deps.x), getSession: stubFn(deps.getSession) as never }))` 로 등록 — 미주입 방어를 위해 `stub()`/`stubFn()` 로 감싼다.
- **변경 체크리스트**
  - [ ] 검증 스키마는 `dto/<도메인>` 에 정의하고 import (라우트에 인라인 금지)
  - [ ] 응답 가능 에러코드를 `errorResponses([...])` 에 선언 (신규 코드면 에러 3파일 먼저 — `lib/` 참조)
  - [ ] 새 팩토리를 `route/index.ts` `createRouter` 에 `stub()`/`stubFn()` 로 등록
  - [ ] `tests/route/<도메인>/<이름>.test.ts` 추가(상태코드·JSON 봉투·401/403/404) — [testing.md](../testing.md) §4.3
  - [ ] [reference/api-endpoints.md](../reference/api-endpoints.md) 표(+파일별 카운트 자기검증)와 해당 [domains/](../domains/) 문서 갱신
- **참조**: [reference/api-endpoints.md](../reference/api-endpoints.md), [architecture.md](../architecture.md) §4·§7, [domains/](../domains/)

---

## `dto/`

- **역할**: Zod 스키마 전용. 요청 검증(라우트 `validator`) + 타입(`z.infer`) + OpenAPI(`errorResponses`). 별도 validator 클래스 없음.
- **배치 규칙**: 도메인별 하위 폴더(`ai`·`blog`·`drive`·`logs`·`mail`·`resume`·`spotify`·`weather`) + 최상위 공통·비폴더 도메인(`badge.ts`·`calendar-*.ts`·`common.ts`·`error-response.ts`). 공통 스키마(`idParamSchema`·`paginationQuerySchema`·`searchQuerySchema`·`timestampSchema`)는 `common.ts`. 스키마만 두고 로직(변환 이상의 가공)은 `service/` 로.
- **작성 컨벤션** (근거: `dto/resume/resume.ts`, `dto/common.ts`, `dto/error-response.ts`)
  - 네이밍: `*CreateSchema`·`*UpdateSchema`·`*ListQuerySchema` + `z.infer` 타입(`*Input`·`*Query`). 타입은 손으로 적지 않고 `z.infer<typeof schema>` 로 유도.
  - 쿼리 파라미터는 `z.coerce.number()...default(...)` 로 문자열 강제변환. 목록 상한은 `.max(...)`.
  - `error-response.ts` 의 `errorResponses(codes)` 가 코드→상태별로 묶어 OpenAPI `responses` 를 만든다. 라우트가 이걸 스프레드해 쓴다.
  - **주의(중복)**: `common.ts` 의 `paginationQuerySchema` 는 `lib/pagination.ts` 와 바이트 동일한 중복이다 — 페이지네이션 스키마는 `common.ts` 를 재사용하고 새로 만들지 않는다.
- **변경 체크리스트**
  - [ ] 타입은 `z.infer` 로 export (수기 타입 금지, any/unknown 금지)
  - [ ] 공통 스키마는 `common.ts` 재사용 (중복 정의 금지)
  - [ ] `tests/dto/<도메인>/<이름>.test.ts` 에 기본값·강제변환·제약위반(`toThrow`) — [testing.md](../testing.md) §4.1
  - [ ] 스키마가 엔드포인트 계약을 바꾸면 해당 [domains/](../domains/)·[reference/api-endpoints.md](../reference/api-endpoints.md) 갱신
- **참조**: [testing.md](../testing.md) §4.1, [domains/](../domains/)

---

## `service/domain/`

- **역할**: 도메인 로직. 입력 DTO 타입 → 도메인 결과/`null`. HTTP `Context` 와 Drizzle 를 모른다.
- **배치 규칙**: 도메인 폴더 10개(`ai`·`badge`·`blog`·`calendar`·`drive`·`logs`·`mail`·`resume`·`spotify`·`weather`). 메일 프로바이더처럼 하위 구현은 `mail/providers/` 로. DB 쿼리는 여기 두지 않고 `compose/` 의 ServiceDb 로 주입받는다.
- **작성 컨벤션** (근거: `service/domain/resume/resume.ts`)
  - 팩토리 `createXxxService(deps) => ({ ... })` + `export type XxxService = ReturnType<typeof createXxxService>`.
  - `XxxServiceDb` 타입 = **도메인 동작 단위 메서드**(`getResumesByUserId`·`insertResume` 식, 범용 CRUD 아님). 이 인터페이스만 의존하고 구현은 `compose/` 가 준다.
  - "없음/권한없음"은 `null` 또는 `{ success: false as const, reason: ... }` 로 반환하고 throw 하지 않는다(throw 는 라우트 몫).
  - **Drizzle 직접 접근 예외**: 일부 파일은 계층 규칙에도 불구하고 직접 쿼리한다 — `service/domain/weather/weather-api-key.ts`, `service/domain/logs/device-key.ts`(문서화된 예외, [reference/db-schema.md](../reference/db-schema.md) §개요). 신규 서비스는 이 예외를 따르지 말고 ServiceDb 주입을 기본으로 한다.
- **변경 체크리스트**
  - [ ] `ServiceDb` 인터페이스를 서비스 파일에 정의하고 구현은 `compose/<도메인>.ts` 에 인라인
  - [ ] `ReturnType` 로 서비스 타입 export (수기 타입 금지)
  - [ ] `tests/service/domain/<도메인>/<이름>.test.ts` — ServiceDb mock 주입, 정상 + `toHaveBeenCalledWith` + 에러 경로 — [testing.md](../testing.md) §4.2
  - [ ] 해당 [domains/](../domains/) 문서(파일 맵·흐름) 갱신
- **참조**: [domains/](../domains/), [architecture.md](../architecture.md) §2

## `service/shared/`

- **역할**: 특정 도메인에 속하지 않는 횡단 서비스(auth-provider·api-token·storage 3종·cache 2종·image/badge 파이프라인·미배선 3종). 14개 파일.
- **배치 규칙**: 2곳 이상 도메인이 쓰거나 도메인 무관한 기반 서비스만 여기. 한 도메인 전용이면 `service/domain/<도메인>/` 로. 새 유틸 함수(서비스 아님)는 `lib/` 후보.
- **작성 컨벤션** (근거: `service/shared/api-token.ts`, [reference/shared-services.md](../reference/shared-services.md))
  - 대부분 Factory `createXxxService(deps)` + `ReturnType` 타입 export. 외부 SDK/Drizzle 는 직접 만들지 않고 `deps` 로 주입.
  - 예외 2: `redis-cache.ts` 는 모듈 싱글톤(`redisCache`, 직접 import), `cache.ts` 는 제네릭 팩토리(`createCache<T>`, 인스턴스별).
  - `api-token.ts` 는 문서화된 Drizzle 직접 접근 예외([reference/db-schema.md](../reference/db-schema.md)).
  - 새 서비스는 `composeShared`(`compose/shared.ts`)에서 인스턴스화해 도메인 compose 로 주입한다.
- **변경 체크리스트**
  - [ ] Factory + `ReturnType` 타입, 외부 의존은 주입
  - [ ] `compose/shared.ts` 에서 생성·노출하고 소비 compose 에 주입(미배선 방지)
  - [ ] `tests/service/shared/<이름>.test.ts` — 주입 mock 또는 `mock.module` — [testing.md](../testing.md) §4.7
  - [ ] [reference/shared-services.md](../reference/shared-services.md) 인벤토리 표에 1행 추가
- **참조**: [reference/shared-services.md](../reference/shared-services.md)

---

## `compose/`

- **역할**: Factory DI 조립 + **ServiceDb 인터페이스의 Drizzle 인라인 구현**. 계층상 Drizzle 쿼리가 존재하는 기본 위치.
- **배치 규칙**: `index.ts`(루트 조립)·`types.ts`(조립 인자 타입)·`shared.ts`(공유 서비스) + 도메인별 9개(`ai`·`blog`·`calendar`·`drive`·`logs`·`mail`·`resume`·`spotify`·`weather`). 도메인 로직은 넣지 않는다(그건 `service/`). compose 는 "쿼리 구현 + 조립"만.
- **작성 컨벤션** (근거: `compose/resume.ts`, `compose/index.ts`, `compose/types.ts`)
  - `composeXxx({ db, ... }: ComposeXxxArgs) => ({ xxxService, ... })`. `import * as schema from '../db/schema'` 후 `db.select/insert/update/delete` 로 ServiceDb 메서드를 인라인 구현해 `createXxxService(...)` 에 주입.
  - `compose/index.ts` 는 `env=getEnv()` `db=getDb()` `core={db,env}` → `composeShared(core)` → 도메인 compose(core + shared 산출물 주입) 순서, 결과를 **스프레드로 평탄 병합**(`return { ...shared, ...blog, ... }`)해 도메인 접두 없는 단일 객체로 노출.
  - 도메인이 core 외 무엇을 더 받는지는 `types.ts` 의 `ComposeXxxArgs` 가 계약한다(예: `ComposeBlogArgs` = core + storageService + imageProcessor).
  - `getEnv()` 호출은 여기 `compose/index.ts` 한 곳(이후 주입된 `env` 사용).
- **변경 체크리스트**
  - [ ] 새 도메인: `types.ts` 에 `ComposeXxxArgs`, `compose/<도메인>.ts` 에 `composeXxx`, `compose/index.ts` 에 호출 + 스프레드 병합 추가
  - [ ] ServiceDb 구현은 `service/`(로직) 아닌 여기(쿼리)에 — 계층 경계 준수
  - [ ] `sql`/`LIKE` 검색은 `lib/sql-utils.ts` `escapeLikePattern` 사용
  - [ ] env 신규 키는 `lib/env.ts` `envSchema` 먼저 → [reference/env.md](../reference/env.md) 갱신
  - [ ] 조립 순서·주입 관계 변경 시 [architecture.md](../architecture.md) §3·[reference/shared-services.md](../reference/shared-services.md) 갱신
- **참조**: [architecture.md](../architecture.md) §3, [reference/shared-services.md](../reference/shared-services.md)

---

## `db/`

- **역할**: `schema.ts`(Drizzle 스키마, 물리 테이블 50개) + `index.ts`(`getDb()` 싱글톤) + `mongo.ts`(metrics 로그·디바이스용 MongoDB 싱글턴 `getMongo`/`closeMongo`, 비-Drizzle).
- **배치 규칙**: 스키마 정의와 풀 생성만. 쿼리는 여기 두지 않는다(`compose/` 및 문서화된 예외 파일). MySQL 은 `schema.ts`+`index.ts`, MongoDB(metrics)는 `mongo.ts` — 이 세 파일 외 추가 없음.
- **작성 컨벤션** (근거: `db/index.ts`, `db/schema.ts`, [reference/db-schema.md](../reference/db-schema.md))
  - `index.ts`: `getDb()` = `mysql2` 풀(`connectionLimit: 20`, `queueLimit: 0`, `uri: DATABASE_URL`) 위 `drizzle(pool, { schema, mode: 'default' })` 싱글톤. `Database = ReturnType<typeof getDb>`, `closeDb()`. `DATABASE_URL` 은 `process.env` 직접(부트스트랩 싱글톤).
  - `schema.ts`: `timestamp(col,{fsp:3}).defaultNow().notNull()`(신규 계열)·PK 관례(varchar36 UUID vs int autoincrement vs bigint)·FK `onDelete` 관례. 셀렉트/인서트 타입은 `$inferSelect`/`$inferInsert` 로 하단 export.
  - **네이밍 함정**: 신규 계열은 물리 snake_case ↔ TS camelCase, **레거시 블로그 계열은 물리 컬럼명 자체가 camelCase**(단 `created_at`/`updated_at`/`deleted_at` 만 snake). `image_assets` 는 블로그 클러스터지만 snake_case.
- **변경 체크리스트**
  - [ ] 스키마 변경 후 `bun run db:push`(마이그레이션 파일 없음)
  - [ ] 새 테이블/컬럼 타입·PK·FK `onDelete` 를 기존 관례에 맞춤
  - [ ] `$inferSelect`/`$inferInsert` 타입 export, 소비처는 유도 타입 사용
  - [ ] 새 에러코드가 필요하면 `lib/` 에러 3파일 동반
  - [ ] [reference/db-schema.md](../reference/db-schema.md) 인벤토리(테이블 수·컬럼·인덱스·FK·사용처) 갱신
- **참조**: [reference/db-schema.md](../reference/db-schema.md), [memory/stack-and-invariants.md](../memory/stack-and-invariants.md)

---

## `lib/`

- **역할**: 도메인·HTTP 프레임워크 무관 순수 유틸 + 코어(에러 3파일·응답 헬퍼·HOF·env·컨텍스트 타입). 파일 32개, 배럴(`index.ts`) 없음 — 소비자는 파일 직접 상대경로 import.
- **배치 규칙**: 2곳 이상 쓰이는 순수 함수만. **새 유틸 작성 전 [reference/lib-utilities.md](../reference/lib-utilities.md) 인벤토리에서 기존 것을 먼저 찾는다**(현존 중복: `external-api.ts`·`pagination.ts`·`db-helper.ts`·`sensitive-filter.ts` 는 비-test 미사용). 상태·외부 SDK 를 가진 건 `service/shared/` 로.
- **작성 컨벤션** (근거: `lib/error.ts`·`lib/api-response.ts`·`lib/with-*.ts`, [reference/lib-utilities.md](../reference/lib-utilities.md))
  - **에러는 3파일**(`error-code.ts` 코드 109종 + `error-message.ts` `Record<ErrorCode,string>` + `error.ts` `STATUS_MAP`/`createAppError`/`isAppError`). 새 에러는 **세 파일 모두** 추가(코드·메시지·상태). `STATUS_MAP` 은 `Record<string,number>` 라 컴파일러가 누락을 못 잡음 — 정합 수동 확인. 도메인 접두사(`BLOG_`·`MAIL_` …).
  - **응답은 `api-response.ts` 헬퍼로만**(`successResponse`/`paginatedResponse`/`errorResponse`). `details` 는 비프로덕션만 직렬화.
  - HOF 는 `with*` 네이밍. 합성 순서 바깥 `withErrorHandling` → 안쪽 `withAuth`/`withRateLimit`. `withRateLimit` 은 user 를 받으므로 auth 뒤.
  - env 는 `env.ts` `getEnv()` 로 단일화(직접 `process.env` 금지, 부트스트랩 예외).
- **변경 체크리스트**
  - [ ] 새 에러: `error-code.ts`·`error-message.ts`·`error.ts`(STATUS_MAP) 3파일 동시 추가
  - [ ] 새 env 키: `env.ts` `envSchema` + [reference/env.md](../reference/env.md)
  - [ ] 기존 유틸 중복 여부를 [reference/lib-utilities.md](../reference/lib-utilities.md) 에서 확인 후 신설
  - [ ] `tests/lib/<이름>.test.ts`(HOF 는 Hono 핸들러 래핑) — [testing.md](../testing.md) §4.6
  - [ ] [reference/lib-utilities.md](../reference/lib-utilities.md) 인벤토리 표에 1행 추가
- **참조**: [reference/lib-utilities.md](../reference/lib-utilities.md), [architecture.md](../architecture.md) §5

---

## `middleware/`

- **역할**: 전역 미들웨어 체인(`index.ts` `createMiddleware`) + 경로별 가드(`require-*`). 10개 파일.
- **배치 규칙**: 전역/그룹 단위 게이트만. 라우트 핸들러 단위 횡단 관심사는 미들웨어가 아니라 `lib/` HOF(`with*`)로.
- **작성 컨벤션** (근거: `middleware/index.ts`, [architecture.md](../architecture.md) §4)
  - `createMiddleware(app, deps)` 가 `cors`(`/api/*`) → `securityHeaders`(`*`) → `logCapture`(`*`, `logEventService` 있을 때만) → `errorHandler`(`*`) 순서로 `app.use`. 순서는 양파 모델이라 의미가 있다.
  - 도메인 가드(`require-weather-key`·`require-device-key`)는 체인 밖에서 라우트가 직접 단다.
  - **함정**: `require-auth`·`require-admin`·`require-api-token`·`request-logger` 는 정의·테스트만 있고 **현재 라우트 미와이어**(라우트 인증은 HOF). 새로 쓸 땐 와이어 여부를 확인한다.
- **변경 체크리스트**
  - [ ] 전역 체인 순서 변경은 신중히(응답 역순 영향) — [architecture.md](../architecture.md) §4 대조
  - [ ] 컨텍스트 변수 세팅은 `lib/hono-types.ts` `HonoVariables` 계약 확인
  - [ ] `tests/middleware/<이름>.test.ts` — 통과/차단 상태코드 — [testing.md](../testing.md) §4.5
  - [ ] 인증/가드 변경 시 [domains/auth.md](../domains/auth.md)·[reference/api-endpoints.md](../reference/api-endpoints.md) 인증표 갱신
- **참조**: [architecture.md](../architecture.md) §4·§6, [domains/auth.md](../domains/auth.md)

---

## `page/`

- **역할**: 홈(`home.tsx`)·정책(`policy.tsx`)·well-known(`well-known.ts`)·어드민(`admin/`) SSR. `index.ts` `createPage` 가 합친다.
- **배치 규칙**: **SSR JSX 전용, CSR/클라이언트 JS 금지.** 데이터 변경은 폼 POST → 303. 어드민 읽기 쿼리는 `page/admin/db.ts`(`createAdminDb`, 문서화된 Drizzle 직접 접근)로. API JSON 응답은 여기 두지 않는다(그건 `route/`).
- **작성 컨벤션** (근거: `page/index.ts`, `page/admin/db.ts`, [hono-reference.md](../hono-reference.md))
  - `hono/jsx`(React 아님). `c.html(<Component/>)`, 상태코드는 2번째 인자. doctype 미부착.
  - 어드민: 외부 정적 `/admin/styles.css`(`page/admin/styles.ts`) + `<AdminShell>` 직접 호출. 가드 `requireAdminPage`(`page/admin/guard.ts`)를 그룹별 `app.use('*', ...)`. 폼 파싱은 `page/admin/format.ts` 수동 헬퍼(zValidator 미사용).
  - 공개 페이지: `hono/css` 태그드 템플릿 + `<Style/>`.
  - 사용자 문자열은 JSX 자동 이스케이프 또는 `escapeHtml`(raw HTML 시).
- **변경 체크리스트**
  - [ ] 클라이언트 JS/CSR 도입 금지(SSR + 폼 POST→303 유지)
  - [ ] 어드민 페이지는 `AdminShell` + `requireAdminPage` 가드 + `page/admin/db.ts` 읽기 계층 사용
  - [ ] `tests/page/admin/<이름>.test.ts` — `stubAdminDb`+`sessionOf`, GET 200 HTML + 폼 POST 303 — [testing.md](../testing.md) §4.4
  - [ ] 어드민 기능 변경 시 [admin-features.md](../admin-features.md), 렌더/폼/가드 패턴 변경 시 [hono-reference.md](../hono-reference.md) 갱신
- **참조**: [hono-reference.md](../hono-reference.md), [admin-features.md](../admin-features.md), [architecture.md](../architecture.md) §1

---

## `masterdata/`

- **역할**: 정적 데이터 JSON. 현재 `locations.json`(기상 격자 위치) 1개.
- **배치 규칙**: 코드가 아닌 정적 참조 데이터만. 현재 소비처는 `compose/weather.ts`(`import locations from '../masterdata/locations.json'`) 단독. `tsconfig` `resolveJsonModule: true` 로 직접 import.
- **변경 체크리스트**
  - [ ] JSON 구조 변경 시 소비처(`compose/weather.ts`) 타입/사용 검증
  - [ ] 위치 데이터 의미는 [domains/weather.md](../domains/weather.md) 갱신
- **참조**: [domains/weather.md](../domains/weather.md)

---

## `public/`

- **역할**: 정적 에셋. `favicon.ico` + `icon/`(배지용 로컬 아이콘 svg/png).
- **배치 규칙**: 앱이 직접 서빙하는 파일만. 일반 `serveStatic` 미들웨어는 없고, 페이지 핸들러가 개별 서빙(`page/home.tsx` 가 `Bun.file(../public/favicon.ico)`). `icon/` 은 `service/shared/icon-loader.ts` `loadLocal` 이 파일명 `^[a-zA-Z0-9_-]+$` 검증 후 로드.
- **변경 체크리스트**
  - [ ] 아이콘 파일명은 영숫자·`_`·`-` 만(icon-loader 검증 통과)
  - [ ] 서빙 경로 추가 시 담당 페이지 핸들러 확인(전역 정적 미들웨어 없음)
- **참조**: [reference/shared-services.md](../reference/shared-services.md)(icon-loader), [deploy.md](../deploy.md) §1

---

## `scripts/`

- **역할**: 일회성/운영 CLI. 현재 `backfill-thread-id.ts`(메일 thread_id 백필) 1개.
- **배치 규칙**: 앱 요청 경로 밖에서 `bun run scripts/<파일>` 로 실행하는 스크립트. `getDb()`/`closeDb()` 로 DB 를 직접 열고 닫으며, 로직은 `lib/`(예: `computeThreadIds`)를 재사용한다. 앱 런타임에 import 되지 않는다.
- **작성 컨벤션** (근거: `scripts/backfill-thread-id.ts`)
  - `process.argv` 로 플래그(`--dry-run`) 처리, 완료 후 `closeDb()`.
- **변경 체크리스트**
  - [ ] 로직은 `lib/`/`service/` 재사용(스크립트에 중복 구현 금지)
  - [ ] 실행 방법·용도를 [utils/index.md](../utils/index.md) 에 기록
  - [ ] DB 를 여닫으면 `closeDb()` 로 풀 종료
- **참조**: [utils/index.md](../utils/index.md)

---

## `tests/`

- **역할**: `bun test` 스위트. 소스 트리를 그대로 미러(`tests/route/blog/post.test.ts` ↔ `route/blog/post.ts`).
- **배치 규칙**: `bunfig.toml` `[test] root = "./tests"`. 6개 최상위 폴더(`dto`·`lib`·`middleware`·`page`·`route`·`service`)가 소스 계층에 대응. 실제 DB·네트워크 없이 주입 mock/`mock.module` 로만. 공용 어드민 mock 은 `tests/page/admin/helpers.ts`(테스트 아님).
- **작성 컨벤션** (근거: [testing.md](../testing.md))
  - `import { describe, expect, test, mock } from 'bun:test'`. `describe`=대상 심볼/`METHOD /path`, `test`=한국어 문장.
  - 계층별 패턴은 [testing.md](../testing.md) §4(dto parse / service ServiceDb mock / route `app.request` / page `stubAdminDb`+`sessionOf` / middleware / lib) 참조.
- **변경 체크리스트**
  - [ ] 새 소스 파일마다 미러 경로에 `*.test.ts` 추가([testing.md](../testing.md) §6 매핑표)
  - [ ] 인터페이스 변경 시 대응 테스트 동반 수정
  - [ ] `bun test <경로>` 부분 검증 + `bunx tsc --noEmit`
- **참조**: [testing.md](../testing.md)

---

## `deploy/`

- **역할**: 메인 앱과 **분리된 별도 Docker 서비스 2개** — `caldav-proxy/`(포트 4000, CalDAV 리버스 프록시), `upload-server/`(포트 4100, 대용량 업로드 상시 서버, 자체 `package.json`).
- **배치 규칙**: `lib/env.ts`/`getEnv()` 지배 밖(자체 `process.env` + 하드코딩 기본값, 독립 env 공간). 루트 앱 의존성을 공유하지 않는다. 메인 앱 코드를 여기 두지 않는다.
- **작성 컨벤션** (근거: [deploy.md](../deploy.md) §4·§5)
  - upload-server ↔ hub 는 콜백 계약(`HUB_BASE_URL` 기준 `/api/drive/assets/:id/*`, `/api/blog/images/complete`) + `uploadToken` 검증 + CORS 오리진으로 신뢰 경계를 잡는다. upload-server 는 상태 없는 중계자.
  - `caldav-proxy` 대상 `TARGET=https://api.gumyo.net` 은 코드 상수(env 아님).
- **변경 체크리스트**
  - [ ] 콜백 경로 변경 시 hub 측 `route/drive/asset.ts`·`route/blog/image.ts` 계약 동기화
  - [ ] env/포트/CORS 변경 시 [deploy.md](../deploy.md) §5·§6, [reference/env.md](../reference/env.md) "deploy/ 별도 서비스" 갱신
  - [ ] 이 서비스 변경은 메인 앱 번들과 무관(별도 Docker 배포)
- **참조**: [deploy.md](../deploy.md) §4·§5, [reference/env.md](../reference/env.md)

---

## `docs/`

- **역할**: 프로젝트 문서. 진입점·읽기 순서(`index.md`)·작업 체크리스트(`PROCESS.md`)·횡단 핵심·도메인·전수 레퍼런스·지침서·분류 저장소.
- **배치 규칙**: 분류는 [acknowledge/2026-07-02-docs-structure.md](../acknowledge/2026-07-02-docs-structure.md) 표를 따른다(architecture/deploy/testing=횡단, `domains/`=도메인, `reference/`=전수 인벤토리, `guidelines/`=지침서, `quality-assurance/`=검증, `memory`·`history`·`bug`·`acknowledge`·`feedback`·`utils`=분류 저장소). **`DESIGN.md`(블로그 프론트 디자인)·`PROCESS.md` 는 수정 금지 대상.**
- **작성 컨벤션**: 한국어 개조식 · 코드로 확인한 사실만 · 상단 `> 기준: <날짜> 코드 검증` 인용 블록 · 표 중심 · **문서 간 중복 금지(상호 링크)**.
- **변경 체크리스트**
  - [ ] 코드 변경 시 대응 문서 갱신(도메인/레퍼런스/지침), 중복 대신 링크
  - [ ] 새 문서는 분류표에 맞는 폴더에 배치하고 상단 인용 블록 추가
  - [ ] `DESIGN.md`·`PROCESS.md` 는 지시 없이 건드리지 않음
- **참조**: [index.md](../index.md), [acknowledge/2026-07-02-docs-structure.md](../acknowledge/2026-07-02-docs-structure.md)

---

## 관련 문서

- 전역 골격·계층·부트스트랩: [architecture.md](../architecture.md)
- 불변 규칙(스택·계층 경계·에러 3파일·db:push·커밋): [memory/stack-and-invariants.md](../memory/stack-and-invariants.md)
- 전수 레퍼런스: [reference/db-schema.md](../reference/db-schema.md) · [reference/api-endpoints.md](../reference/api-endpoints.md) · [reference/env.md](../reference/env.md) · [reference/lib-utilities.md](../reference/lib-utilities.md) · [reference/shared-services.md](../reference/shared-services.md)
- 도메인별: [domains/](../domains/) · 어드민 SSR: [hono-reference.md](../hono-reference.md) · [admin-features.md](../admin-features.md)
- 테스트: [testing.md](../testing.md) · 배포: [deploy.md](../deploy.md) · 로깅: [logging.md](../logging.md)
