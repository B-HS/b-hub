# 어드민 페이지 추가

> 기준: 2026-07-02 (dev @ `f20afcf`) 코드 검증. 다루는 코드: `page/admin/index.ts`, `page/admin/nav.ts`, `page/admin/guard.ts`, `page/admin/components.tsx`, `page/admin/format.ts`, `page/admin/db.ts`, `page/admin/dashboard.tsx`, `page/admin/pages/logs.tsx`, `page/admin/pages/blog.tsx`, `db/schema.ts`, `tests/page/admin/helpers.ts`, `tests/page/admin/index.test.ts`, `tests/page/admin/dashboard.test.ts`, `tests/page/admin/resumes.test.ts`

새 어드민 SSR 페이지를 추가하는 절차만 다룬다. Hono 렌더링·폼·가드 메커니즘의 정본은 [../hono-reference.md](../hono-reference.md), 이미 존재하는 페이지의 기능 인벤토리는 [../admin-features.md](../admin-features.md), 테스트 실행·작성 관례는 [../testing.md](../testing.md), 계층·부트스트랩은 [../architecture.md](../architecture.md) 가 소유한다. 여기서는 그 문서들을 순서대로 엮는 체크리스트와 `page/admin/db.ts`·페이지 파일·라우트 배선·nav·대시보드·테스트 스텁의 구체 절차를 소유한다. 정본 예시는 최근 추가된 Log Events 페이지(`/admin/logs`)의 실제 파일 흐름을 인용한다.

---

## 1. 원칙 (SSR JSX only)

- 어드민 페이지는 **SSR(Hono JSX) 전용**이다. CSR·클라이언트 JS가 없다 — `page/admin/` 전체에 `<script>`·`on*` 핸들러·`dangerouslySetInnerHTML`·`'use client'`·`useState` 가 하나도 없다(grep 검증). 상호작용은 순수 HTML 폼으로만 한다.
- **필터 = GET 폼**(`FilterBar`, `method='get'`), **액션 = POST 폼**(`RowAction`, `method='post'`) → 처리 후 `c.redirect(..., 303)`. POST/Redirect/GET 패턴은 [../hono-reference.md](../hono-reference.md) §10.
- 데이터 접근은 `service/`·`route/` 계층을 우회해 `page/admin/db.ts`(`AdminDb`)로 Drizzle 을 직접 조회·변경한다. **사용자 범위 필터가 없다**(전 사용자 데이터). 계층 우회의 유일한 예외다 — [../admin-features.md](../admin-features.md) §16.
- 인가는 전역이 아니라 **페이지 그룹별** `requireAdminPage(getSession)` 게이트로 건다(`page/admin/guard.ts`). 미인증 → `/admin/login?next=...`(303), `role !== 'admin'` → 403 HTML(`renderForbidden`).
- 예외로 볼 만한 곳은 하나뿐이다: `guard.ts` 의 `renderForbidden` 이 JSX 가 아니라 raw HTML 문자열(`<!doctype html>...`)을 `c.html(...)` 로 반환한다(403). 이는 CSR 예외가 아니라 렌더 방식 차이이며, 일반 페이지는 doctype 없이 `<html lang='ko'>` 루트를 그대로 내보낸다([../hono-reference.md](../hono-reference.md) §1·§9).

---

## 2. 추가 단계 체크리스트

- [ ] 1. `page/admin/db.ts` — `AdminDb` 에 조회/변경 함수 추가 (§3)
- [ ] 2. `page/admin/pages/<x>.tsx` — 페이지 컴포넌트 + 라우트 팩토리 작성 (§4)
- [ ] 3. `page/admin/index.ts` — `createAdminRoute` 에 라우트 마운트 (§5)
- [ ] 4. `page/admin/nav.ts` — 사이드바 메뉴 등록 (§6)
- [ ] 5. `page/admin/dashboard.tsx` + `db.ts` `counts()` — 대시보드 카운트 (필요 시, §7)
- [ ] 6. `tests/page/admin/<x>.test.ts` + `helpers.ts` stub 확장 (§8)
- [ ] 7. `docs/admin-features.md` 갱신 (§9)

---

## 3. Step 1 — `db.ts`: `AdminDb` 조회/변경 함수

- `AdminDb = ReturnType<typeof createAdminDb>`. `createAdminDb(db: Database)` 가 도메인 무관 메서드 객체를 반환하고, 각 페이지 라우트가 필요한 메서드만 호출한다.
- import 는 `import { and, desc, eq, gte, isNotNull, isNull, like, lte, or, sql } from 'drizzle-orm'` + `import * as s from '../../db/schema'`.
- **list 함수 관례**: `params: { page; size; ...필터 }` 를 받아 `{ rows, total }` 를 반환한다. 필터는 `conds[]` 배열에 조건을 push 하고 `conds.length ? and(...conds) : undefined` 로 조립한다. 카운트와 페이지 슬라이스를 각각 조회한다.

```ts
listLogEvents: async (params: { page; size; service?; severityGte?; deviceId?; errorCode?; unresolved?; from?; to? }) => {
    const offset = (params.page - 1) * params.size
    const conds = []
    if (params.service) conds.push(eq(s.logEvents.service, params.service))
    if (params.severityGte != null) conds.push(gte(s.logEvents.severity, params.severityGte))
    if (params.unresolved === 'y') conds.push(isNull(s.logEvents.resolvedAt))
    // ...
    const where = conds.length ? and(...conds) : undefined
    const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(s.logEvents).where(where)
    const rows = await db.select().from(s.logEvents).where(where).orderBy(desc(s.logEvents.createdAt)).limit(params.size).offset(offset)
    return { rows, total: Number(c ?? 0) }
}
```

(`page/admin/db.ts` `listLogEvents`)

- **변경 함수 관례**: 결과 없이 Drizzle `update`/`delete` 만 수행한다(반환 타입 미명시 → `Promise<void>`).

```ts
resolveLogEvent: async (id: number) => {
    await db.update(s.logEvents).set({ resolvedAt: new Date() }).where(eq(s.logEvents.id, id))
}
```

(`page/admin/db.ts` `resolveLogEvent`)

- 테이블·컬럼은 `db/schema.ts` 정의를 쓴다(예: `logEvents` = `log_events`, 컬럼 `service`·`errorCode`·`severity`·`deviceId`·`resolvedAt`·`createdAt`). 스키마 전수는 [../reference/db-schema.md](../reference/db-schema.md).
- 대시보드용 `recentX` 목록 함수는 select 컬럼을 명시하고 `.orderBy(desc(...)).limit(limit)` 로 상위 N건만 조회한다(`recentLogEvents`, `severity >= 40` + limit 5).
- **row 타입은 db.ts 가 원천이다.** 페이지 컴포넌트가 `Awaited<ReturnType<AdminDb['listLogEvents']>>['rows'][number]` 로 유도하므로(§4), 컬럼을 손으로 다시 선언하지 않는다.

---

## 4. Step 2 — `pages/<x>.tsx`: 페이지 컴포넌트 + 라우트 팩토리

한 파일에 **페이지 FC + `createXxxRoute` 팩토리**를 함께 둔다(`page/admin/pages/logs.tsx` 참조).

### 4.1 로컬 헬퍼 · row 타입

- 각 페이지 파일은 `sanitizeReturn`·`appendFlash` 를 **로컬로 정의**한다(공유 유틸이 아니라 파일마다 중복 정의됨 — 코드 사실).
    - `sanitizeReturn(raw, fallback)` — `returnTo` 가 `/admin` 접두여야 채택, 아니면 `fallback`(오픈 리다이렉트 방지).
    - `appendFlash(path)` — `?flash=ok` 또는 `&flash=ok` 부착.
- row 타입은 db 반환에서 유도: `type LogEventRow = Awaited<ReturnType<AdminDb['listLogEvents']>>['rows'][number]`.

### 4.2 페이지 컴포넌트 — 공용 컴포넌트 조립

페이지 FC 는 `user`·`rows`·`total`·`page`·`size`·필터들·`flash` 를 props 로 받아 `<AdminShell>` 안에 `FilterBar` → `DataTable` → `Pagination` 을 조립한다. 공용 컴포넌트는 모두 `page/admin/components.tsx` 에서 import 한다.

| 컴포넌트 | 페이지에서의 용도 |
|---|---|
| `AdminShell` | 최외곽(사이드바+토바+breadcrumbs+flash 배너). props: `title`·`subtitle`·`user`·`currentPath`·`flash`·`breadcrumbs` |
| `FilterBar` | 상단 필터(GET 폼). `action`·`fields`(`text`/`select`/`number`/`date`)·`hidden` |
| `DataTable<T>` | 목록 테이블. `rows`·`columns`(`Column<T>` = `key`·`header`·`cell`·`className`)·`rowKey`·`empty` |
| `Pagination` | 이전/다음(쿼리 보존). `page`·`pageSize`·`total`·`baseQuery`·`basePath` |
| `Badge` | 상태 표시. `kind`: `default`/`secondary`/`outline`/`success`/`muted`/`destructive` |
| `RowAction` | 단건 POST 액션 폼. `action`·`label`·`variant`·`confirmText`·`hidden`·`returnTo` |
| `Stat` | 대시보드 카드(§7). `label`·`value`·`delta` |

- 셀·쿼리 값 포맷은 `page/admin/format.ts` 헬퍼를 쓴다.

| 헬퍼 | 용도 |
|---|---|
| `parseIntOr(v, fallback)` | 쿼리 정수 파싱(비정수/NaN → fallback) |
| `parseDateStart(v)` / `parseDateEnd(v)` | `YYYY-MM-DD` → 하루의 시작/끝 `Date`(범위 필터) |
| `formatDate(d)` / `formatDateShort(d)` | `YYYY-MM-DD HH:mm:ss` / `YYYY-MM-DD`(null → `-`) |
| `formatBytes(n)` | 바이트 → `B`/`KB`/`MB`… |
| `maskToken(t)` | 토큰 마스킹(`앞4…뒤4`) |
| `truncate(text, max)` | 길이 컷(`…`) |
| `ynLabel(v)` | boolean → `YES`/`NO` |
| `clampPage(page, totalPages)` | 페이지 범위 클램프 |

- 컴포넌트 props 상세·마크업은 [../hono-reference.md](../hono-reference.md) §3, 컴포넌트 목록은 [../admin-features.md](../admin-features.md) §17.

### 4.3 라우트 팩토리 — GET 렌더 + form POST → 303

```tsx
export const createLogEventsRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200)
        // ...필터 쿼리 파싱...
        const { rows, total } = await deps.adminDb.listLogEvents({ page, size, /* 필터 */ })
        const flash = c.req.query('flash') === 'ok' ? { kind: 'ok' as const, message: '해소 처리되었습니다.' } : null
        return c.html(<LogEventsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} flash={flash} /* 필터 */ />)
    })

    app.post('/:id/resolve', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        const body = await c.req.parseBody<{ returnTo?: string }>()
        if (id > 0) await deps.adminDb.resolveLogEvent(id)
        return c.redirect(appendFlash(sanitizeReturn(body.returnTo, '/admin/logs')), 303)
    })

    return app
}
```

(`page/admin/pages/logs.tsx` `createLogEventsRoute`)

- 팩토리 인자는 `{ getSession, adminDb }`(mail 만 `triggerMailSync` 추가). 반환은 가드가 걸린 `new Hono<AdminContext>()` — `AdminContext` 는 `guard.ts`(`Variables: { adminUser }`).
- 첫 줄에 `app.use('*', requireAdminPage(deps.getSession))` 로 그룹 가드를 건다. 이후 `c.get('adminUser')` 로 세션 사용자를 읽는다.
- **GET**: 쿼리 파싱(`parseIntOr` page, `Math.min(Math.max(...), min), max)` 로 size 클램프 — 상·하한은 도메인마다 다르다, `flash` 는 `c.req.query('flash')`) 후 `c.html(<Page .../>)`.
- **POST 액션**: `parseBody<{ returnTo?: string }>()` → id 가드(`parseIntOr(param, 0)`, `if (id > 0)`) → `adminDb` 변경 → `c.redirect(appendFlash(sanitizeReturn(body.returnTo, 기본경로)), 303)`. `returnTo` 는 목록의 `RowAction returnTo` hidden input 이 실어 보낸다(§4.2).
- **컬렉션 생성 폼 변형**(참고): 카테고리·태그처럼 상단 생성 폼이 있는 페이지는 컬렉션 루트로 POST 한다 — `app.post('/categories', ...)` 가 `parseBody<{ name?: string }>()` 를 읽고 `insertCategory(name)` 후 고정 경로 `'/admin/blog/categories?flash=ok'` 로 303(이 경우 `returnTo` 없이 고정 경로). `page/admin/pages/blog.tsx` 참조.

---

## 5. Step 3 — `index.ts`: 라우트 마운트

- `page/admin/index.ts` 의 `createAdminRoute` 에 팩토리 import + `app.route('/<prefix>', createXxxRoute(baseDeps))` 를 추가한다. `baseDeps = { getSession: deps.getSession, adminDb }`.

```ts
app.route('/logs', createLogEventsRoute(baseDeps))
```

- 프리픽스는 `app.route(...)` 의 첫 인자이고, 페이지 파일 내부 라우트는 상대경로(`/`·`/:id/resolve`)다. 위 예에서 실제 경로는 `GET /admin/logs`·`POST /admin/logs/:id/resolve`.
- `/styles.css`·`/login` 은 도메인 라우트 **앞**에 마운트되며 그룹 가드 밖이다. 도메인 라우트는 각자 `requireAdminPage` 를 건다(§4.3).
- `createAdminRoute` 는 `adminDb ?? createAdminDb(db)` 로 어댑터를 조립한다. 조립 체인 전체는 [../hono-reference.md](../hono-reference.md) §7.

---

## 6. Step 4 — `nav.ts`: 사이드바 메뉴

- `page/admin/nav.ts` 의 `NAV: readonly NavGroup[]` 에 항목을 추가한다. 기존 그룹에 `{ href, label }` 을 넣거나 새 `{ title, items }` 그룹을 추가한다.

```ts
{ title: 'Observability', items: [{ href: '/admin/logs', label: 'Log Events' }] }
```

(`page/admin/nav.ts` — Log Events 는 `Observability` 그룹)

- active 표시는 `isActivePath(current, href)`: `/admin` 은 정확 일치, 그 외는 `current === href || current.startsWith(href + '/')`.
- 페이지 FC 의 `<AdminShell currentPath='/admin/logs'>` 값이 `href` 와 맞아야 사이드바가 active 로 렌더된다.

---

## 7. Step 5 — 대시보드 카운트 (필요 시)

대시보드에 카드/최근 테이블을 노출할 때만 수정한다. 세 지점을 함께 바꾼다.

1. `page/admin/db.ts` `counts()` — 카운트 쿼리 추가 + 반환 객체에 필드 추가. Log Events 예: `logEvents24h`(`created_at > date_sub(now(), interval 1 day)`)·`logErrors24h`(`severity >= 40 and ...`).
2. (선택) `page/admin/db.ts` `recentX` — 최근 N건 목록 함수(예: `recentLogEvents`).
3. `page/admin/dashboard.tsx` — `<Stat>` 카드 또는 `<DataTable>` 테이블 추가. Log Events 예: `<Stat label='Log Errors (24h)' value={counts.logErrors24h} delta={`events ${counts.logEvents24h}`} />` + "최근 로그 이벤트 (ERROR+)" 테이블.

- `dashboard.tsx` 의 `Counts` 타입은 `Awaited<ReturnType<AdminDb['counts']>>` 로 유도되므로 `counts()` 반환 필드를 추가하면 컴포넌트가 자동 인지한다. 단 테스트 스텁(`helpers.ts`)의 `counts()` 반환 객체에도 같은 필드를 추가해야 한다(§8).
- 대시보드 카드/테이블 목록은 [../admin-features.md](../admin-features.md) §0.

---

## 8. Step 6 — 테스트 (`tests/page/admin/`)

테스트 실행·assertion 관례의 정본은 [../testing.md](../testing.md) §4.4 다. 여기서는 어드민 페이지 추가 시의 구체 절차만 적는다.

### 8.1 `helpers.ts` mock 확장

- `tests/page/admin/helpers.ts` 의 `stubAdminDb(overrides)` 는 `base: AdminDb` 에 **모든 메서드를 빈 결과로 스텁**한 뒤 `overrides` 를 덮는다. 새 `AdminDb` 메서드를 추가하면 `base` 에도 스텁을 추가한다.
    - list 류 → `emptyList()`(`{ rows: [], total: 0 }`), 배열 반환 → `emptyArr()`(`[]`), 변경 류 → `ok()`(`Promise.resolve()`).
    - `counts()` 에 필드를 추가했으면(§7) `base.counts` 반환 객체에도 같은 필드를 추가한다.
- **주의**: `base` 는 `as unknown as AdminDb` 로 캐스팅돼 있어 **메서드 누락을 tsc 가 잡지 못한다.** 스텁을 빠뜨리면 테스트에서 해당 메서드가 `undefined` 로 호출돼 런타임 실패한다 → 새 메서드는 반드시 수동 추가한다.
- Log Events 가 이미 반영된 예: `helpers.ts` 의 `listLogEvents`·`resolveLogEvent`·`recentLogEvents` 스텁 + `counts()` 의 `logEvents24h`·`logErrors24h`.

### 8.2 페이지 테스트 (정본: `resumes.test.ts`)

`createApp` 헬퍼가 `new Hono()` 에 팩토리를 마운트하고 `stubAdminDb` 로 실데이터·spy 를 주입한다.

```ts
const createApp = (overrides = {}) => {
    const app = new Hono()
    app.route('/admin/resumes', createResumesRoute({
        getSession: sessionOf(mockAdmin),
        adminDb: stubAdminDb({ listResumes: () => Promise.resolve({ rows: [sampleRow], total: 1 }), ...overrides }),
    }))
    return app
}
```

필수 케이스:

- **list GET**: `res.status === 200`, `await res.text()` 에 기대 문자열 포함, 페이지네이션 요약(`'1–1 / 1'`) 포함. 필터 prefill(`value="foo"`), `size` 클램프(`listX.mock.calls[0][0].size` = 하한/상한), 잘못된 `page` → 1 폴백.
- **action POST**: 변경 메서드를 `mock(() => Promise.resolve())` 로 override → `app.request(path, { method: 'POST', body: new URLSearchParams() })` → `303` + `location` 에 `flash=ok` + `toHaveBeenCalledWith(id)`. `returnTo` 정상 반영, 외부 도메인(`https://evil.com`) 무시 후 기본 경로 폴백, `id` 0 은 미호출.
- **가드**: `sessionOf(null)` → 303 `/admin/login`, `sessionOf(mockUser)` → 403. 픽스처 `mockAdmin`(`role: 'admin'`)·`mockUser`(`role: 'user'`) 는 `helpers.ts` 가 export.

### 8.3 라우트 번들 스윕 등록

- `tests/page/admin/index.test.ts` 는 `adminRoutes` 배열의 모든 list 경로에 대해 관리자 200 / 미인증 303 / 비관리자 403 을 스윕한다. **새 페이지의 list 경로를 이 배열에 추가**한다.
- 코드 사실(주의): 최신 Log Events 페이지는 아직 전용 `logs.test.ts` 가 없고, `index.test.ts` 의 `adminRoutes` 스윕 목록에도 `/admin/logs` 가 빠져 있다. 새 페이지를 추가할 때는 전용 테스트 작성과 스윕 목록 등록을 함께 한다.
- 검증: `bun test tests/page/admin/<x>.test.ts` 로 부분 실행 + `bunx tsc --noEmit`.

---

## 9. Step 7 — `admin-features.md` 갱신

- 새 페이지의 List 컬럼 / Filter / Action / 엔드포인트를 [../admin-features.md](../admin-features.md) 에 반영한다: 도메인 섹션 추가 + §15 라우트 구조 트리 + §18 파일 맵. 새 사이드바 그룹은 §0 상단의 사이드바 그룹 나열에도 반영한다.
- 새 테이블을 조회한다면 [../reference/db-schema.md](../reference/db-schema.md) 와의 정합을 확인한다(어드민 미노출 테이블 목록은 admin-features §18 말미).

---

## 관련 문서

- [../hono-reference.md](../hono-reference.md) — Hono JSX 렌더·폼·가드·스타일·응답 메커니즘 정본.
- [../admin-features.md](../admin-features.md) — 기존 어드민 페이지 기능·라우트·컴포넌트 인벤토리.
- [../testing.md](../testing.md) — 테스트 실행·작성 관례(§4.4 어드민 페이지).
- [../architecture.md](../architecture.md) — 계층 경계·부트스트랩·미들웨어.
- [../domains/logs.md](../domains/logs.md) · [../logging.md](../logging.md) — 예시로 인용한 Log Events 의 도메인·데이터 모델.
