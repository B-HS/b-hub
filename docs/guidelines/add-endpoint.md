# 엔드포인트 추가 (add-endpoint)

> 기준: 2026-07-02 (dev @ `f6c65f3`) 코드 검증. 다루는 코드: `dto/blog/post.ts`, `service/domain/blog/post.ts`, `compose/blog.ts`, `route/blog/post.ts`, `route/logs/log-event.ts`, `route/index.ts`, `lib/with-auth.ts`, `lib/error.ts`·`lib/error-code.ts`·`lib/error-message.ts`, `dto/error-response.ts`, `lib/sql-utils.ts`, `tests/route/blog/post.test.ts`, `tests/service/domain/blog/post.test.ts`

**기존 도메인**(ai·blog·mail·calendar·drive·spotify·weather·resume·badge·logs·auth)에 HTTP 엔드포인트 하나를 추가하는 절차를 소유한다. 신규 도메인(폴더 4곳 신설·`compose()` 배선) 추가는 이 문서 범위 밖이다. 계층 골격·부트스트랩·응답 봉투·HOF 합성 순서의 정본은 [../architecture.md](../architecture.md), 인증 수단 총람은 [../domains/auth.md](../domains/auth.md), 전 라우트 인벤토리는 [../reference/api-endpoints.md](../reference/api-endpoints.md) 다 — 여기서는 중복하지 않고 링크한다.

방향은 항상 **아래→위**(DTO → service → compose → route → 배선)로 쌓고, 각 계층은 [../architecture.md](../architecture.md) §2 의 책임 경계(Route 만 HTTP 인지, compose 만 Drizzle 인지)를 지킨다.

---

## 1. 체크리스트

- [ ] a. **DTO 스키마** — `dto/<domain>/<resource>.ts` 에 Zod 스키마 + `z.infer` 타입 (접미사 규칙 §3)
- [ ] b. **service 메서드** — `service/domain/<domain>/<resource>.ts` 의 `create*Service` 에 메서드 추가, 필요 시 `*ServiceDb` 인터페이스 확장 (§4)
- [ ] c. **compose Drizzle 구현** — `compose/<domain>.ts` 에서 확장한 `*ServiceDb` 메서드를 Drizzle 로 인라인 구현 (§5)
- [ ] d. **route** — `route/<domain>/<resource>.ts` 에 `describeRoute` + `validator` + 인증(§7) + `withErrorHandling` + `null→createAppError` + 응답 헬퍼 (§6)
- [ ] e. **route 배선** — `route/index.ts` 의 해당 마운트 접두사에 팩토리 연결(`stub`/`stubFn`), 새 팩토리면 `router.route(...)` 추가 (§6.4)
- [ ] f. **에러코드(필요 시)** — 새 실패 케이스면 `lib/error-code.ts`·`lib/error-message.ts`·`lib/error.ts` 3파일 동시 추가 (§8)
- [ ] g. **테스트** — `tests/route/<domain>/<resource>.test.ts` + `tests/service/domain/<domain>/<resource>.test.ts` (§9)
- [ ] h. **문서 갱신** — [../reference/api-endpoints.md](../reference/api-endpoints.md) 표에 행 추가 + 파일별 카운트·합계 갱신, 스키마 변경 시 §10

> 정본 수직 슬라이스: `dto/blog/post.ts` → `service/domain/blog/post.ts` → `compose/blog.ts` → `route/blog/post.ts` → `route/index.ts`. 인증 HOF 예시가 필요하면 `route/logs/log-event.ts`(`withAdmin`·`requireDeviceKey`).

---

## 2. 검증 명령

| 목적 | 명령 |
|------|------|
| 타입체크 | `bunx tsc --noEmit` |
| 해당 테스트 | `bun test tests/route/<domain>/<resource>.test.ts tests/service/domain/<domain>/<resource>.test.ts` |
| 전체 테스트 | `bun test` |
| 스키마 반영(DB 변경 시) | `bun run db:push` (§10) |

각 단계 완료 후 최소 `bunx tsc --noEmit` 를 돌리고 다음 단계로 넘어간다.

---

## 3. DTO 스키마 (`dto/<domain>/<resource>.ts`)

Zod 스키마만 둔다(별도 validator 클래스 없음). 입력 타입은 손으로 적지 않고 `z.infer` 로 유도한다. 정본: `dto/blog/post.ts`.

### 접미사 규칙 (코드로 확인)

| 접미사 | 용도 | 정본 위치 |
|--------|------|-----------|
| `*ListQuerySchema` / `*Query` | GET 목록 쿼리 + 타입 | `dto/blog/post.ts:3` `postListQuerySchema`, `:62` `PostListQuery` |
| `*IdParamSchema` | path 파라미터 검증 | `dto/blog/post.ts:23` `postIdParamSchema` |
| `*CreateSchema` / `*Input` | POST 바디 + 타입 | `dto/blog/post.ts:27` `postCreateSchema`, `:63` `PostCreateInput` |
| `*UpdateSchema` / `*UpdateInput` | PUT·PATCH 바디 + 타입 | `dto/blog/post.ts:35` `postUpdateSchema`, `:64` `PostUpdateInput` |
| `*ResponseSchema` | 응답 구조(OpenAPI resolver 용) | `dto/blog/post.ts:46` `postResponseSchema` |

### 세부 규칙

- **쿼리 파라미터는 `z.coerce` + `.default(...)`** 로 문자열을 안전하게 강제 변환한다: `page: z.coerce.number().int().positive().default(1)`, `limit: ...min(1).max(100).default(20)` (`dto/blog/post.ts:4-5`).
- 쿼리의 boolean 은 `z.enum(['true','false']).transform((v) => v === 'true').optional()` 패턴(`dto/blog/post.ts:9-12`). 바디의 boolean 은 `z.boolean()`(`:32`).
- 타입은 파일 하단에 `export type X = z.infer<typeof xSchema>` 로만 선언한다(`dto/blog/post.ts:62-64`). 손으로 union 을 다시 적지 않는다.
- 응답 스키마를 `describeRoute` 의 `resolver(...)` 로 노출하려면 `hono-openapi/zod` 의 `resolver` 를 쓴다(`route/logs/log-event.ts:80` 이 `resolver(z.array(logEventResponseSchema))` 로 감싼다. 스키마 정의는 `dto/logs/log-event.ts:51` 의 `logEventResponseSchema`. 인라인 응답이면 `:33` 처럼 `resolver(z.object({...}))` 도 가능).

---

## 4. service 메서드 (`service/domain/<domain>/<resource>.ts`)

`create*Service(deps)` 팩토리에 메서드를 추가한다. Service 는 **HTTP·Drizzle 을 모른다** — DTO 입력 타입을 받아 도메인 결과 또는 `null` 을 반환하고, `throw` 변환은 route 가 한다. 정본: `service/domain/blog/post.ts`.

- **`*ServiceDb` 는 도메인 동작 단위 메서드 인터페이스**(범용 CRUD 아님): `getPostList`·`getPostById`·`insertPost`·`updatePost`·`deletePost`·`incrementViews`(`service/domain/blog/post.ts:19-53`). 새 동작이 DB 접근을 필요로 하면 이 타입에 메서드를 추가한다.
- **"없음"은 `null` 반환**으로 표현: `getById` 는 조회 실패 시 `return null`(`:81-84`), `update`/`delete` 는 존재 확인 후 없으면 `null`(`:97-107`). route 가 이 `null` 을 `createAppError` 로 바꾼다.
- 서비스는 DTO 입력 타입을 인자로 받는다: `list(query: PostListQuery)`·`create(input: PostCreateInput)`·`update(postId, input: PostUpdateInput)`(`:60`·`:87`·`:97`). offset 등 파생값은 서비스에서 계산한다(`:61` `(query.page - 1) * query.limit`).
- 서비스 타입은 손으로 적지 않고 파일 끝에서 유도: `export type PostService = ReturnType<typeof createPostService>`(`:110`).
- `PostServiceDeps = { db: PostServiceDb }`(`:55-57`) — 외부 서비스가 더 필요하면(예: storage) deps 에 추가하고 compose 에서 주입한다.

---

## 5. compose Drizzle 구현 (`compose/<domain>.ts`)

Drizzle 쿼리는 **오직 여기**에 존재한다. §4 에서 확장한 `*ServiceDb` 메서드를 인라인 구현해 `create*Service(...)` 에 주입한다. 정본: `compose/blog.ts` 의 `composeBlog`(`:10` 시그니처, `:11-169` `postService` 주입).

- compose 함수는 core(`db`·`env`) + shared 산출물을 구조분해로 받는다: `composeBlog({ db, env, storageService, imageProcessor }: ComposeBlogArgs)`(`compose/blog.ts:10`). 무엇을 더 받는지는 `compose/types.ts` 의 `Compose<Domain>Args` 가 계약한다([../architecture.md](../architecture.md) §3).
- 스키마는 `import * as schema from '../db/schema'` 후 필요한 테이블만 구조분해(`compose/blog.ts:14` `const { posts, categories, postTags, tags } = schema`).
- **쓰기(다중 테이블)는 트랜잭션**: `db.transaction(async (tx) => { ... })`, insert 후 `$returningId()` 로 PK 회수(`compose/blog.ts:113-131` `insertPost`).
- **LIKE 검색은 `escapeLikePattern` 으로 와일드카드 이스케이프**: `like(posts.title, `%${escapeLikePattern(params.keyword)}%`)`(`compose/blog.ts:49`, 유틸 `lib/sql-utils.ts`). 사용자 입력을 raw 로 잇지 않는다.
- 동적 필터는 `.$dynamic()` + 조건 배열 + `and(...conditions)` 패턴(`compose/blog.ts:45-59`). 목록은 데이터 쿼리와 `COUNT(*)` 쿼리를 같은 조건으로 함께 만든다(`:61-71`).
- 구현한 서비스는 compose 반환 객체에 **도메인 접두 없이 평탄한 키**로 노출한다(`compose/blog.ts:581-589` `return { postService, ... }`). `createRouter`/`createPage` 가 이 평탄 객체에서 꺼낸다.

---

## 6. route (`route/<domain>/<resource>.ts`)

HTTP 경계. `describeRoute`(문서) + `validator`(검증) + 인증(§7) + `withErrorHandling`(에러 래핑) + `null→createAppError` + 응답 헬퍼로 구성한다. 정본: `route/blog/post.ts`(인라인 세션 검사) · `route/logs/log-event.ts`(HOF·미들웨어).

### 6.1 팩토리 골격

- 파일은 `create<Resource>Route(deps) => Hono` 팩토리다. 인스턴스는 `new Hono()`(`route/blog/post.ts:18`) 또는 컨텍스트 변수를 쓰면 `new Hono<AuthContext>()`(`route/logs/log-event.ts:23`).
- deps 타입에 서비스와 `getSession` 을 선언한다. `getSession` 타입은 `Parameters<typeof withAuth>[0]['getSession']` 로 유도하면 정확하다(`route/logs/log-event.ts:19`).
- 팩토리는 반드시 `route` 인스턴스를 반환하고(`route/blog/post.ts:111`), 마운트는 §6.4 의 `createRouter` 가 한다.

### 6.2 핸들러 구성 (순서)

`route.<method>(path, describeRoute({...}), validator(...), withErrorHandling(...))` 순서로 인자를 나열한다(`route/blog/post.ts:20-39`).

- **`describeRoute`**: `tags`(도메인 태그, 예 `['Blog']`·`['Logs']`), `summary`(한국어 한 줄), `responses`(성공 200 + `...errorResponses([...])`)(`route/blog/post.ts:22-25`, `:43-49`).
- **`validator`**: 쿼리는 `validator('query', xListQuerySchema)`, 바디는 `validator('json', xCreateSchema)`. 검증값은 `c.req.valid('json' as never) as z.infer<typeof xCreateSchema>` 로 꺼낸다(`route/blog/post.ts:27`·`:29`, `:72`·`:78`).
- **`withErrorHandling`**: 모든 핸들러를 감싼다(`route/blog/post.ts:28`). 인증 HOF 를 쓰면 **바깥 `withErrorHandling` → 안쪽 `withAuth`/`withAdmin`** 순으로 합성한다(`route/logs/log-event.ts:86-87`, [../architecture.md](../architecture.md) §4).
- **path 파라미터·조회 실패는 `createAppError`**: `const id = Number(c.req.param('id')); if (isNaN(id)) throw createAppError('BLOG_POST_NOT_FOUND')`, 서비스가 `null` 이면 다시 `throw`(`route/blog/post.ts:52-56`).

### 6.3 응답 헬퍼 (`lib/api-response.ts`)

`c.json` 에 임의 구조를 직접 넣지 않고 헬퍼로만 봉투를 만든다([../architecture.md](../architecture.md) §4).

| 헬퍼 | 반환 | 정본 |
|------|------|------|
| `successResponse(data)` | `{ success: true, data }` | `route/blog/post.ts:58` `c.json(successResponse({ post }))` |
| `paginatedResponse(data, { page, limit, total })` | `+ pagination`(`totalPages` 자동) | `route/blog/post.ts:31-37` |
| `errorResponse(...)` | `{ success: false, error }` | 라우트가 직접 부르지 않음 — `withErrorHandling` 가 사용 |

- **offset 기반 목록**은 page 를 계산해 넘긴다: `paginatedResponse(data, { page: Math.floor(q.offset / q.limit) + 1, limit: q.limit, total })`(`route/logs/log-event.ts:109`).
- 성공 응답에 200 외 상태가 필요하면 `c.json(successResponse(...), 201)` 처럼 상태를 명시한다(캘린더 생성 등, [../reference/api-endpoints.md](../reference/api-endpoints.md)).

### 6.4 route 배선 (`route/index.ts`)

전체 Path = 마운트 접두사 + 팩토리 내부 경로. 기존 팩토리에 메서드만 추가했으면 배선은 그대로다. 새 팩토리를 추가했으면 `createRouter` 에 마운트한다.

- 의존성은 미구성 방어를 위해 `stub()`/`stubFn()` 로 감싼다: `createPostRoute({ postService: stub(deps.postService), getSession: stubFn(deps.getSession) as never })`(`route/index.ts:113-119`). `stub`/`stubFn` 은 미주입 시 호출하면 `SERVICE_NOT_CONFIGURED`(503) 를 던지는 Proxy/함수다(`route/index.ts:44-59`).
- logs 배선 예: `router.route('/logs', createLogEventRoute({ logEventService: stub(deps.logEventService), deviceKeyService: stub(deps.deviceKeyService), getSession: stubFn(deps.getSession) as never }))`(`route/index.ts:325-331` 부근).
- 서비스가 compose 반환 객체에 새로 생겼으면 그 키가 `deps.<service>` 로 들어온다(§5 의 평탄 병합).

---

## 7. 인증 선택 기준

라우트 인증의 기본은 HOF(`lib/with-auth.ts`)이고, 도메인 키/디바이스는 라우트가 직접 다는 미들웨어다. **아래 표는 "성격 → 수단" 선택 기준**이며, 수단별 검사 지점·저장·엔드포인트별 실제 매핑의 정본은 [../domains/auth.md](../domains/auth.md) §1·§4 다(불일치 시 auth.md 를 따른다).

| 엔드포인트 성격 | 인증 표기 | 검사 수단 | 정본 예시 |
|-----------------|-----------|-----------|-----------|
| 공개 조회(목록·상세·공개 이미지) | `없음` | 인증 래퍼 없음 | `GET /api/blog/posts` (`route/blog/post.ts:20`) |
| 로그인 사용자 본인 리소스 | `세션` | `withAuth({ getSession })(handler)` 또는 핸들러 내 `getSession` | mail·resume·calendar 등; `withAuth`(`lib/with-auth.ts:10`) |
| 관리자 전용 | `어드민` | `withAdmin({ getSession })(handler)` / 핸들러 내 `getSession`+`role!=='admin'` / 라우트 로컬 `requireAdmin` 클로저 | HOF: `route/logs/log-event.ts:86-87` · 인라인: `route/blog/post.ts:74-76` · 로컬 클로저: blog admin/category/tag([../domains/auth.md](../domains/auth.md) §4.1) |
| 디바이스(펌웨어) 수집 | `device-key` | `requireDeviceKey` 미들웨어(`X-Device-Key`) | `POST /api/logs` (`route/logs/log-event.ts:38`) |
| weather 데이터 | `weather-key` | `requireWeatherKey`/`requireWeatherKeyNoLog`(`X-Weather-Key`) | `/api/weather/*` |
| 발송·무거운 트리거(rate-limit) | `세션` + rate limit | `withRateLimit({ checkLimit })` 를 `withAuth` **안쪽**에 합성 | `POST /api/mail/messages/send`·`POST /api/mail/sync` ([../domains/auth.md](../domains/auth.md) §6.3) |
| 헤더 API 토큰 | (미연결) | `withApiToken`(`lib/with-auth.ts:23`) 정의만, 라우트 미배선 | 없음 — 붙이려면 `validateToken: apiTokenService.validate` 주입 필요([../domains/auth.md](../domains/auth.md) §4.3) |

- **HOF 시그니처**: `withAuth`/`withAdmin` 은 `(deps) => (handler) => (c)` 커링이고, 검증 통과 시 인증된 `user` 를 핸들러 2번째 인자로 넘긴다(`lib/with-auth.ts:10-21`). 실패는 `UNAUTHORIZED`(401)/`FORBIDDEN`(403).
- **관리자 게이팅은 3가지 변형이 공존**한다(위 표). 새 라우트는 HOF(`withAdmin`)를 기본으로 하되, 같은 파일의 기존 패턴이 인라인/로컬 클로저면 그에 맞춘다([../architecture.md](../architecture.md) §7, [../domains/auth.md](../domains/auth.md) §4.1).
- 미들웨어(`requireDeviceKey` 등)는 핸들러 인자 목록에서 `withErrorHandling` **앞**에 둔다(`route/logs/log-event.ts:38-40`).

---

## 8. 에러코드 (필요 시, 3파일 동시)

새 실패 케이스를 던지려면 세 파일에 **동시에** 추가한다. 하나라도 빠지면 타입 에러(`ERROR_MESSAGE: Record<ErrorCode, string>` 가 전수 대응 강제).

| 파일 | 추가 항목 |
|------|-----------|
| `lib/error-code.ts` | `ERROR_CODE` 객체에 `DOMAIN_REASON: 'DOMAIN_REASON'`(도메인 접두: `BLOG_*`·`MAIL_*`·`LOG_*` 등) |
| `lib/error-message.ts` | `ERROR_MESSAGE` 에 같은 키의 한국어 메시지 |
| `lib/error.ts` | `STATUS_MAP` 에 코드→HTTP 상태(미매핑 시 `getStatusCode` 가 500 폴백, `lib/error.ts:107`) |

- 던지기: `throw createAppError('DOMAIN_REASON'[, details])`(`lib/error.ts:109`). `new Error()` 직접 throw 금지.
- 라우트 `describeRoute.responses` 에 `...errorResponses(['DOMAIN_REASON', ...])` 로 선언하면 OpenAPI 에 상태·메시지가 자동 반영된다(`dto/error-response.ts:16` — 코드를 상태별로 묶어 `ERROR_MESSAGE` 를 description 으로).
- 에러 흐름·자동 로그 캡처 상세는 [../architecture.md](../architecture.md) §5, 인증 관련 코드 목록은 [../domains/auth.md](../domains/auth.md) §12.

---

## 9. 테스트 (route + service)

`tests/` 는 소스 트리를 그대로 미러한다(`tests/route/blog/post.test.ts` ↔ `route/blog/post.ts`). 실제 DB·네트워크 없이 mock 으로 돈다. 작성 패턴 정본은 [../testing.md](../testing.md) §4.2(service)·§4.3(route).

### 9.1 service 테스트 (`tests/service/domain/<domain>/<resource>.test.ts`)

- `create*Service({ db })` 에 **mock ServiceDb** 를 주입한다. 각 메서드는 `mock(() => Promise.resolve(...))`(`tests/service/domain/blog/post.test.ts:20-27`).
- 반환값과 **DB 호출 인자**를 함께 검증: `expect(db.getPostList).toHaveBeenCalledWith({ offset: 0, limit: 20, ... })`(`:38-47`). `null` 경로(존재하지 않는 id)와 부수효과(`incrementViews` 호출 여부)도 검사한다(`:83-100`).
- 에러 전파는 mock 을 `Promise.reject(...)` 로 바꾸고 `await expect(service.getById(1)).rejects.toThrow(...)`(`:197-203`).

### 9.2 route 테스트 (`tests/route/<domain>/<resource>.test.ts`)

- `new Hono()` 에 팩토리를 마운트하고 `app.request(url, init)` 로 요청 주입(`tests/route/blog/post.test.ts:32-36`). 전역 미들웨어를 거치지 않고 팩토리를 격리 검증한다.
- deps 는 **service mock + getSession mock**: `getSession: mock(() => Promise.resolve({ user: { id: 'user-1', role: 'admin' } }))`(`:21-30`).
- 상태코드와 응답 봉투를 검증: 200/`body.success`/`body.data`/`body.pagination`(`:38-55`), 401(세션 null)·403(role 'user')(`:91-121`), 404(없는 id·비숫자 id)(`:67-71`·`:170-176`).

---

## 10. 문서·DB 갱신

- **[../reference/api-endpoints.md](../reference/api-endpoints.md)**: 해당 도메인 표에 행(`Method | 전체 Path | 인증 | 설명 | 핸들러 파일`) 추가, 그 도메인의 "파일 카운트" 문장과 하단 "파일별 라우트 카운트(자기검증)" 표, `API(/api/*) 라우트 등록 합계`(현재 167)를 함께 갱신한다.
- **도메인 문서**(`../domains/<domain>.md`): 파일 맵·엔드포인트·에러코드 표에 반영(그 도메인 문서가 소유).
- **스키마 변경 시**: `db/schema.ts` 를 고치고 `bun run db:push` 로 반영한다. **마이그레이션 파일은 없고 `drizzle/` 은 gitignored**([../architecture.md](../architecture.md) §8, 스키마 정본 [../reference/db-schema.md](../reference/db-schema.md)). 스키마 컬럼은 DB snake_case ↔ TS camelCase 매핑을 유지한다.

---

## 11. 자주 하는 실수

- **Drizzle 을 service 에 작성** — 쿼리는 compose 에만. service 는 `*ServiceDb` 인터페이스만 호출한다(§4·§5).
- **service 에서 `throw`** — "없음"은 `null` 반환, `createAppError` 변환은 route 담당(§4·§6.2).
- **`c.json` 에 직접 객체** — 반드시 `successResponse`/`paginatedResponse`(§6.3).
- **`withErrorHandling` 누락 또는 합성 순서 뒤집힘** — 항상 최바깥에서 감싼다(§6.2).
- **에러코드 3파일 중 일부만 추가** — `ERROR_MESSAGE` 전수 대응이라 타입 에러(§8).
- **`route/index.ts` 에서 `stub`/`stubFn` 없이 raw 주입** — 미구성 방어가 깨진다(§6.4).
- **`api-endpoints.md` 카운트/합계 미갱신** — 자기검증 수치가 어긋난다(§10).
- **DTO 타입을 손으로 선언** — `z.infer` 로만 유도(§3).
