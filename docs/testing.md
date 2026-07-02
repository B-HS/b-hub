# 테스트 (Testing)

> 기준: 2026-07-02 (dev @ `f20afcf`) 코드 검증. 다루는 코드: `bunfig.toml`, `package.json`, `tsconfig.json`, `tests/**`(dto·lib·middleware·page·route·service), `tests/page/admin/helpers.ts`, 대표 테스트 `tests/route/blog/post.test.ts`·`tests/page/admin/blog.test.ts`·`tests/service/domain/mail/mail-sync.test.ts`·`tests/dto/blog/post.test.ts`·`tests/middleware/require-auth.test.ts`·`tests/service/domain/weather/kma-api.test.ts`·`tests/lib/with-error-handling.test.ts`·`tests/service/domain/mail/providers/imap-provider.test.ts`

## 개요

- 러너는 Bun 내장 테스트(`bun:test`)다. Jest·Vitest 등 별도 프레임워크·러너 의존성이 없다(`package.json` devDependencies 에 테스트 러너 없음).
- 위치는 `bunfig.toml` 의 `[test] root = "./tests"` 로 고정한다. preload·setup 파일은 없다.
- `tests/` 는 **소스 트리를 그대로 미러**한다(`tests/route/blog/post.test.ts` ↔ `route/blog/post.ts`).
- 모든 테스트는 **실제 DB·네트워크 없이** 돈다. Drizzle·외부 API·저장소 의존은 전부 주입 mock(ServiceDb·`fetchFn`·`getSession`) 또는 `mock.module` 로 대체한다.
- 계층 경계·부트스트랩·에러/응답 헬퍼의 정의는 [architecture.md](./architecture.md) 가, 도메인별 엔드포인트·스키마는 [domains/](./domains/) 가, 어드민 페이지 기능은 [admin-features.md](./admin-features.md) 가 소유한다. 이 문서는 테스트 실행·작성 방식만 다룬다.

---

## 1. 디렉터리 구조 (소스 미러)

`tests/` 하위 6개 최상위 폴더가 각 소스 계층에 대응한다.

| tests/ 폴더 | 대응 소스 | 검증 대상 | 파일 수 |
|-------------|-----------|-----------|:------:|
| `tests/dto/` | `dto/` | Zod 스키마의 `parse` — 기본값·강제변환(`z.coerce`)·범위 제약·실패 케이스 | 28 |
| `tests/lib/` | `lib/` | 에러 3파일(`error-code`·`error`), 응답 헬퍼(`api-response`), HOF(`with-*`), 순수 유틸(pagination·token·url·xml·mail-thread 등) | 25 |
| `tests/middleware/` | `middleware/` | Hono 미들웨어 게이트 — 인증(`require-auth`)·권한(`require-admin`)·토큰(`require-api-token`)·로깅·보안헤더·에러핸들러 | 9 |
| `tests/page/` | `page/` | SSR JSX 어드민 라우트 — HTML 렌더 결과 + 폼 POST → 303 리다이렉트(CSR 없음) | 21 |
| `tests/route/` | `route/` | HTTP 엔드포인트 — 상태코드 + JSON 응답 봉투(`success`/`data`/`pagination`/`error`) | 33 |
| `tests/service/` | `service/domain/*`·`service/shared/*` | 도메인 서비스 로직(ServiceDb mock, 34) + 횡단 서비스(storage·cache·image 등, 13) | 47 |

합계 163개 `*.test.ts` 파일. `tests/page/admin/helpers.ts` 는 테스트가 아니라 어드민 페이지 테스트용 공용 mock 헬퍼다.

---

## 2. 실행 명령

| 명령 | 용도 |
|------|------|
| `bun test` | 전체 스위트 실행(= `bun run test`, `package.json` 스크립트) |
| `bun test <경로>` | 부분 실행. 파일(`bun test tests/route/blog/post.test.ts`) 또는 디렉터리(`bun test tests/service`) |
| `bun test --coverage` | 커버리지 포함(= `bun run test:coverage`) |
| `bun run typecheck` | 타입체크(= `tsc --noEmit`). `bunx tsc --noEmit` 로도 실행 |

- `tsconfig.json` 이 루트에 있어 `tsc --noEmit` 이 소스+테스트 전체를 타입체크한다.

---

## 3. 현재 상태 (실행 결과)

`bun test` 를 `~/b-hub` 에서 1회 실행한 결과(2026-07-02):

| 항목 | 값 |
|------|-----|
| pass | 2077 |
| fail | 0 |
| expect() calls | 4973 |
| 파일 | 163 |
| 소요 | 22.68s |
| exit code | 0 |

- 콘솔에 찍히는 `[mail] attachment download failed ...`, `[prepare] quota=... `, `Gmail API error 500/404/403` 등의 로그는 **테스트 실패가 아니다.** 에러 경로(다운로드 실패·쿼터 초과·API 오류)를 의도적으로 트리거하는 케이스에서 SUT 자체 로깅이 출력된 것이며, 해당 테스트는 통과한다(0 fail).

---

## 4. 패턴별 작성 방식

### 4.1 dto — Zod 스키마 (`tests/dto/`)

스키마를 import 해 `.parse()` 결과를 검증한다. 유효 입력의 기본값·강제변환과, 제약 위반 시 `toThrow()` 를 함께 확인한다. (예: `tests/dto/blog/post.test.ts`)

```
const result = postListQuerySchema.parse({})
expect(result.page).toBe(1)          // 기본값
expect(() => postListQuerySchema.parse({ limit: '101' })).toThrow()  // 상한 위반
```

### 4.2 service — ServiceDb mock (`tests/service/`)

서비스 팩토리(`createXxxService`)에 **mock 으로 구현한 ServiceDb 와 의존 서비스**를 주입한다. ServiceDb 메서드는 `mock(() => Promise.resolve(...))` 로 스텁하고, 도메인 결과값과 `toHaveBeenCalledWith` 로 DB 호출 인자를 검증한다. (예: `tests/service/domain/mail/mail-sync.test.ts` — `createMailSyncService({ db, accountService })`)

```
const deps = { db: createMockDb(), accountService: createMockAccountService() }
const service = createMailSyncService(deps)
const result = await service.syncAccount(1, 'user-1')
expect(deps.db.updateSyncLog).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'success' }))
```

- 에러 경로는 mock 을 `Promise.reject(...)` 로 바꾸고 `await expect(...).rejects.toMatchObject({ code: 'MAIL_PROVIDER_ERROR' })` 로 검증한다.
- 부분 override 는 `createDeps({ db: { getActiveSession: mock(...) } })` 처럼 기본 mock 위에 덮어쓴다.

### 4.3 route — Hono 요청 주입 (`tests/route/`)

`new Hono()` 인스턴스에 **라우트 팩토리를 직접 마운트**하고 `app.request(url, init)` 로 요청을 주입한다. `index.ts` 의 전역 미들웨어를 거치지 않고 팩토리를 격리 테스트한다. 인증은 팩토리에 주입하는 `getSession` mock 으로 제어한다. (예: `tests/route/blog/post.test.ts`)

```
const app = new Hono()
app.route('/blog/posts', createPostRoute(deps))   // deps = { postService(mock), getSession(mock) }
const res = await app.request('/blog/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...}) })
expect(res.status).toBe(200)
const body = await res.json()
expect(body.success).toBe(true)
```

- `getSession` 을 `null` 로 주면 401, `role: 'user'` 로 주면 403 을 검증한다(팩토리 내부 `withAuth`/`withAdmin` 이 주입된 `getSession` 을 사용).
- 응답은 `res.status` + `await res.json()`(JSON 봉투) 로 확인한다.

### 4.4 page/admin — stubAdminDb + sessionOf (`tests/page/admin/`)

어드민 SSR 라우트를 `new Hono()` 에 마운트하고 `app.request` 로 호출한 뒤 **HTML 텍스트**(`await res.text()`)에 기대 문자열이 포함되는지, 폼 POST 가 303 을 반환하고 mock 이 올바른 인자로 호출됐는지 검증한다. 공용 mock 은 `tests/page/admin/helpers.ts` 가 제공한다.

- `stubAdminDb(overrides)`: `AdminDb` 의 모든 메서드를 빈 결과(`{ rows: [], total: 0 }`·`[]`·`Promise.resolve()`)로 스텁한 전체 객체를 만들고, `overrides` 로 특정 메서드만 실데이터·spy mock 으로 교체한다.
- `sessionOf(user)`: `user`(또는 `null`)를 `{ user }` 로 감싸 반환하는 `getSession` mock. 픽스처 `mockAdmin`(`role: 'admin'`)·`mockUser`(`role: 'user'`)를 함께 export.

```
const app = new Hono()
app.route('/admin/blog', createBlogRoute({ getSession: sessionOf(mockAdmin), adminDb: stubAdminDb({ listPosts: () => Promise.resolve({ rows: [samplePost], total: 1 }) }) }))
const res = await app.request('/admin/blog/posts/1/publish', { method: 'POST', body: new URLSearchParams() })
expect(res.status).toBe(303)
expect(togglePostFlag).toHaveBeenCalledWith(1, 'isPublished')
```

### 4.5 middleware — 게이트 검증 (`tests/middleware/`)

`app.use('*', middleware(deps))` 로 미들웨어를 얹고, 뒤에 테스트용 핸들러를 둔 뒤 상태코드와 컨텍스트 주입 값을 확인한다. (예: `tests/middleware/require-auth.test.ts` — 세션 없으면 401, 있으면 `c.get('user')` 설정, `getSession` throw 시 500)

### 4.6 lib / HOF (`tests/lib/`)

순수 유틸은 입출력을 직접 검증한다. HOF(`with-*`)는 `new Hono()` 에 감싼 핸들러를 얹어 동작을 확인한다. (예: `tests/lib/with-error-handling.test.ts` — 정상 통과, `createAppError` → 상태코드·`error.code`·`details` 매핑, 미확인 에러 → 500 `INTERNAL_ERROR`)

### 4.7 외부 API mock — 2가지 방식

| 방식 | 언제 | 예시 |
|------|------|------|
| **의존성 주입** | 서비스 팩토리가 `fetchFn` 등 외부 호출을 주입받도록 설계된 경우(선호) | `tests/service/domain/weather/kma-api.test.ts` — `createKmaApiService({ apiKey, fetchFn })` 에 mock `fetchFn` 주입, 성공/HTTP오류/네트워크오류/타임아웃·URL 파라미터를 `fetchFn.mock.calls[0][0]` 로 검증 |
| **`mock.module`** | SUT 가 모듈을 직접 import 해 주입 불가한 경우(3개 파일) | `tests/service/domain/mail/providers/imap-provider.test.ts`(`imapflow`·`nodemailer`), `tests/service/domain/weather/kma-api.test.ts`(`redis-cache`), `tests/service/shared/redis-cache.test.ts`(`ioredis`) |

- `mock.module(...)` 은 **SUT import 전에** 등록돼야 한다. `kma-api.test.ts` 는 최상위에서 `mock.module('.../redis-cache', ...)` 를 먼저 실행하고 `const { createKmaApiService } = await import('.../kma-api')` 로 동적 import 해 순서를 보장한다.

---

## 5. 네이밍·기술 관례 (코드로 확인)

- 파일명은 `<소스명>.test.ts`, 소스 경로를 미러한다.
- import 는 `import { describe, expect, test, mock, beforeEach } from 'bun:test'`.
- **`describe` = 대상 단위**: 스키마·함수 심볼명(`postListQuerySchema`, `withErrorHandling`), 라우트는 `METHOD /path`(`GET /blog/posts`, `POST /admin/blog/posts/:id/publish`), 또는 한국어 그룹명(`Posts 필터 (tag / notice / category)`).
- **`test` = 한국어 문장**으로 동작을 서술한다(`'게시글 목록을 반환한다'`, `'인증 없으면 401을 반환한다'`).
- assertion 은 `toBe`/`toEqual`/`toHaveLength`/`toBeDefined`/`toBeNull`/`toContain`/`toThrow`, mock 호출은 `toHaveBeenCalledWith`/`toHaveBeenCalledTimes`/`not.toHaveBeenCalled`, 인자 직접 검사는 `mock.calls[0][0]`, 거부는 `await expect(...).rejects.toMatchObject(...)`.
- mock 은 `mock(() => Promise.resolve(...))` 로 만들고, 고정 픽스처는 override 가능한 팩토리(`mockFolder(overrides)`)로 둔다.
- `beforeEach`/`afterEach` 는 상태 리셋이 필요한 일부 파일에서만 쓴다(env·redis-cache·calendar·mail/spotify provider·drive-asset 등). `spyOn`·가짜 타이머(`setSystemTime`)·`jest.*` 는 쓰지 않는다.

---

## 6. 새 코드 → 어디에 테스트를 추가하나

| 추가한 코드 | 테스트 위치 | 필수 케이스 |
|-------------|-------------|-------------|
| dto Zod 스키마 | `tests/dto/<도메인>/<이름>.test.ts` | 기본값·강제변환·유효 파싱 + 제약 위반 `toThrow` |
| `service/domain` 서비스 | `tests/service/domain/<도메인>/<이름>.test.ts` | ServiceDb mock 주입, 정상 결과 + DB 호출 인자(`toHaveBeenCalledWith`) + 에러 경로(`rejects.toMatchObject`) |
| `service/shared` 서비스 | `tests/service/shared/<이름>.test.ts` | 성공/실패 분기, 외부 호출은 주입 또는 `mock.module` |
| route 엔드포인트 | `tests/route/<도메인>/<이름>.test.ts` | `new Hono()` + 팩토리 마운트 + `app.request`, 상태코드·JSON 봉투 + 인증/권한 실패(401/403)·404 |
| 어드민 페이지 | `tests/page/admin/<이름>.test.ts` | `stubAdminDb`+`sessionOf`, GET 200 HTML 포함 검증 + 폼 POST 303 + mock 호출 인자, 필요 시 `require-admin` 게이트 |
| 미들웨어 | `tests/middleware/<이름>.test.ts` | `app.use('*', mw())` + 통과/차단 상태코드 |
| lib 유틸·HOF | `tests/lib/<이름>.test.ts` | 입출력 직접 검증(HOF 는 Hono 핸들러로 래핑) |

- 새 에러코드(`lib/error-code.ts`)·응답 봉투 변경은 `tests/lib/error*.ts`·`tests/lib/api-response.test.ts` 에 반영한다.
- 추가·수정 후 `bun test <해당 경로>` 로 부분 검증하고, `bunx tsc --noEmit` 로 타입을 확인한다.

---

## 관련 문서

- 계층 경계·부트스트랩·에러/응답 헬퍼: [architecture.md](./architecture.md)
- 도메인별 엔드포인트·스키마·서비스: [domains/](./domains/)
- 어드민 페이지 기능 매핑: [admin-features.md](./admin-features.md)
- 중앙 로깅(`log_events`): [logging.md](./logging.md)
