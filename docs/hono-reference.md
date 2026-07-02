# Hono SSR Admin Page — 핵심 레퍼런스

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 다루는 코드: `tsconfig.json`, `page/index.ts`, `page/admin/index.ts`, `page/admin/components.tsx`, `page/admin/styles.ts`, `page/admin/guard.ts`, `page/admin/login.tsx`, `page/admin/dashboard.tsx`, `page/admin/format.ts`, `page/admin/pages/logs.tsx`, `page/home.tsx`, `page/policy.tsx`

hyun-hub 어드민 페이지(`page/admin/`) 작성용 Hono 기능 요약. 어드민 페이지는 **CSR 없음, SSR JSX 전용**. 이 문서는 Hono 렌더링·폼·가드 패턴만 소유한다 — 어드민 기능 인벤토리는 [admin-features.md](./admin-features.md), 부트스트랩·계층·미들웨어 구성은 [architecture.md](./architecture.md), 불변 규칙은 [memory/stack-and-invariants.md](./memory/stack-and-invariants.md) 참조.

---

## 1. JSX 렌더링 (Hono JSX, React 아님)

- 파일 확장자 `.tsx`. `tsconfig.json`: `"jsx": "react-jsx"`, `"jsxImportSource": "hono/jsx"`.
- 타입은 `hono/jsx`에서 import: `import type { FC, PropsWithChildren, Child } from 'hono/jsx'`.
- 컴포넌트는 함수. children · Fragment(`<>...</>`) · boolean 분기(`{cond && <X/>}`) 지원.
- 응답은 `c.html(<Component/>)`. **`c.html()`은 JSX를 그대로 렌더할 뿐 `<!DOCTYPE html>`을 붙이지 않는다** (`node_modules/hono/dist/context.js`의 `html()`은 content-type을 `text/html; charset=UTF-8`으로 지정하고 그대로 반환).
- 이 프로젝트의 어드민·공개 JSX 페이지는 **doctype 없이 `<html lang='ko'>` 루트를 그대로 내보낸다** (`page/admin/components.tsx`의 `AdminShell`, `page/admin/login.tsx`의 `LoginPage`, `page/home.tsx`의 `HomePage`). doctype이 필요하면 raw HTML 문자열로 직접 쓴다 — `page/admin/guard.ts`의 Forbidden 페이지가 `c.html('<!doctype html>...', 403)` 문자열로 반환하는 것이 유일한 예.
- `hono/jsx-renderer`의 `jsxRenderer` 미들웨어는 기본적으로 `<!DOCTYPE html>`을 prepend하지만 이 프로젝트에서는 사용하지 않는다(§3).

```tsx
import type { FC, PropsWithChildren } from 'hono/jsx'

export const AdminShell: FC<PropsWithChildren<ShellProps>> = ({ title, user, children }) => (
    <html lang='ko'>
        <head>
            <meta charset='UTF-8' />
            <title>{title} · Admin</title>
            <link rel='stylesheet' href='/admin/styles.css' />
        </head>
        <body>{children}</body>
    </html>
)

app.get('/', (c) => c.html(<Dashboard user={c.get('adminUser')} /* ... */ />))
```

## 2. 스타일링 — 어드민은 외부 정적 스타일시트, 공개 페이지는 `hono/css`

용도별로 방식이 나뉜다.

- **어드민(`page/admin/`)**: `hono/css`를 쓰지 않는다. 단일 정적 CSS 문자열 `ADMIN_DESIGN_TOKENS_CSS`(`page/admin/styles.ts`)를 `GET /admin/styles.css`로 서빙(`page/admin/index.ts`)하고, 각 페이지 `<head>`에서 `<link rel='stylesheet' href='/admin/styles.css' />`로 링크한다. 디자인 토큰(`:root { --color-* }`) · 다크모드(`@media (prefers-color-scheme: dark)`) · 전역 리셋(`*`, `html`, `body`) · 유틸 클래스(`.btn`, `.card`, `.badge`, `.t`, `.filter-bar` 등)가 모두 이 문자열 한 곳에 있다.
- **공개 페이지(`page/home.tsx`, `page/policy.tsx`)**: `hono/css`의 `css` 태그드 템플릿 + `<head>`의 `<Style />`. `css`가 클래스명을 반환하고 `<Style/>`가 수집된 블록을 주입한다.

```tsx
// 공개 페이지: page/home.tsx
import { Style, css } from 'hono/css'

const bodyStyle = css`
    display: flex;
    justify-content: center;
    background: #fafafa;
`

const HomePage = () => (
    <html lang='ko'>
        <head>
            <Style />
        </head>
        <body class={bodyStyle}>...</body>
    </html>
)
```

```ts
// 어드민: page/admin/index.ts — 정적 스타일시트 라우트
app.get('/styles.css', (c) => c.body(ADMIN_DESIGN_TOKENS_CSS, { headers: ADMIN_DESIGN_TOKENS_CACHE_HEADERS }))
```

## 3. 레이아웃 조립 — `<AdminShell>` 컴포넌트 직접 호출

- `hono/jsx-renderer`(`c.setRenderer` / `c.render`)는 이 프로젝트에서 쓰지 않는다.
- 어드민 공통 레이아웃은 `page/admin/components.tsx`의 `AdminShell` 컴포넌트다. `children`과 `title` / `subtitle` / `user` / `currentPath` / `breadcrumbs` / `flash`를 props로 받아 `<html>`~`<body>` 전체와 Sidebar · Topbar · Breadcrumbs · FlashBanner를 렌더한다.
- 각 페이지 컴포넌트가 `<AdminShell ...>{내용}</AdminShell>`을 반환하고, 라우트 핸들러가 `c.html(<Page .../>)`로 렌더한다.
- 공용 UI 컴포넌트(모두 `page/admin/components.tsx`): `AdminShell`, `DataTable<T>` + `Column<T>`, `Badge`, `Pagination`, `FilterBar` + `FilterField`, `RowAction`, `Stat`.

## 4. 타입드 컨텍스트 (Variables)

- 어드민 컨텍스트 타입은 `page/admin/guard.ts`의 `AdminContext = { Variables: { adminUser: AdminSessionUser } }`.
- 가드(`requireAdminPage`)가 `c.set('adminUser', session.user)`로 주입, 핸들러·컴포넌트에서 `c.get('adminUser')`로 읽는다.

```ts
type AdminContext = { Variables: { adminUser: AdminSessionUser } }

const app = new Hono<AdminContext>()
app.use('*', requireAdminPage(deps.getSession))
app.get('/', (c) => c.html(<Page user={c.get('adminUser')} />))
```

## 5. 폼 / 쿼리 파라미터

- `await c.req.parseBody<{ ... }>()` — 폼 POST 바디(`application/x-www-form-urlencoded`). 예: `page/admin/pages/logs.tsx`의 resolve 핸들러가 `const body = await c.req.parseBody<{ returnTo?: string }>()`.
- `c.req.query('page')` — 단일 쿼리. (`c.req.queries('tag')` 다중은 Hono API지만 어드민에서 미사용.)
- `c.req.param('id')` — path param.

```tsx
app.post('/:id/resolve', async (c) => {
    const id = parseIntOr(c.req.param('id'), 0)
    const body = await c.req.parseBody<{ returnTo?: string }>()
    if (id > 0) await deps.adminDb.resolveLogEvent(id)
    return c.redirect(appendFlash(sanitizeReturn(body.returnTo, '/admin/logs')), 303)
})
```

## 6. 응답 (어드민에서 쓰는 것)

- `c.html(node)` → `text/html; charset=UTF-8`. 상태코드는 2번째 인자로: `c.html(<Forbidden/>, 403)`.
- `c.redirect(url, 303)` — 폼 POST 후 GET 리다이렉트(§10).
- `c.body(data, { headers })` — 정적 자산(styles.css) · 바이너리(favicon 등).
- `c.json` / `c.text`도 Hono API로 사용 가능하나 어드민 페이지는 주로 `c.html` / `c.redirect` / `c.body`.

## 7. 라우터 합치기 / basePath

- (일반 Hono) `app.route('/admin', adminPages)`로 prefix 부여, `app.get(...).post(...)` 체이닝 가능.
- 이 프로젝트 조립 체인: `createPage`(`page/index.ts`)가 `/admin`에 `createAdminRoute`를 mount → `createAdminRoute`(`page/admin/index.ts`)가 `/styles.css`는 `app.get` 직접 핸들러로, `/login` · 도메인별 `create*Route(baseDeps)`는 각각 `app.route(...)`로 mount. 각 도메인 `create*Route`는 `new Hono<AdminContext>()`를 반환한다(가드가 걸리는 17개 라우트 팩토리 — `pages/api.tsx`·`pages/ai.tsx`가 각 2·3개를 export하고 나머지 12파일은 1개씩; AI 프로바이더 라우트 `ai/providers`·`ai/sessions`·`ai/prompts` 포함). 최상위 `createAdminRoute`와 가드 없는 `createLoginRoute`는 타입 없는 `new Hono()`다.

## 8. 가드 미들웨어 — `requireAdminPage`

- `page/admin/guard.ts`의 `requireAdminPage(getSession)`를 각 페이지 라우트 그룹에서 `app.use('*', requireAdminPage(deps.getSession))`로 건다(전역 `/admin/*` 한 곳이 아니라 그룹별).
- 세션 없음 → `c.redirect('/admin/login?next=<현재 pathname+search>', 303)`.
- `session.user.role !== 'admin'` → `renderForbidden`(raw HTML 문자열, 403).
- 통과 시 `c.set('adminUser', session.user)` 후 `next()`.

```ts
export const requireAdminPage = (getSession: AdminGetSession) => async (c: Context, next: Next) => {
    const session = await getSession(c)
    if (!session) {
        const url = new URL(c.req.url)
        return c.redirect(`/admin/login?next=${encodeURIComponent(url.pathname + url.search)}`, 303)
    }
    if (session.user.role !== 'admin') return renderForbidden(c, session.user)
    c.set('adminUser', session.user)
    await next()
}
```

## 9. HTML 이스케이프

- JSX 텍스트 노드는 기본 자동 이스케이프(XSS 안전).
- raw HTML 문자열을 직접 만들 때는 수동 이스케이프 — `page/admin/guard.ts`의 `escapeHtml`이 사용자 email을 문자열에 넣기 전에 `&<>"'`를 치환한다.
- `raw()`(`hono/html`) · JSX `dangerouslySetInnerHTML`은 신뢰된 HTML에만. 어드민 SSR 페이지는 현재 신뢰되지 않은 HTML을 주입하지 않는다(사용자 문자열은 JSX 자동 이스케이프 또는 `escapeHtml`로 처리).

## 10. 폼 → 서버 흐름 (CSR 없이 데이터 변경)

1. `<form method='post' action='/admin/...'>` — 컴포넌트 `RowAction`(`page/admin/components.tsx`)이 생성하며 hidden `returnTo` · `confirm`을 포함.
2. 핸들러에서 처리 후 `c.redirect(returnTo, 303)` — POST / Redirect / GET 패턴.
3. 플래시는 query로 전달: 리다이렉트 URL에 `?flash=ok`를 붙이고(`appendFlash`) 다음 GET에서 `c.req.query('flash')`로 읽어 `AdminShell`의 `flash` prop에 넣는다. `returnTo`는 `sanitizeReturn`으로 `/admin` 접두를 검증한다.

## 11. 페이지네이션 & 필터 — URL query + 수동 파서 (validator 미사용)

- 목록 상태(page · size · 필터)는 모두 URL query에 인코딩 — 북마크/뒤로가기 친화. `FilterBar`는 `method='get'` 폼, `Pagination`은 링크로 query를 유지한다.
- 파싱은 `hono-openapi` 의 `validator` 가 아니라 `page/admin/format.ts` 헬퍼로 수동 처리: `parseIntOr(v, fallback)`, `parseDateStart` / `parseDateEnd`, 범위는 `Math.min(Math.max(...))`로 클램프. `dto/*` Zod 스키마를 재사용하지 않는다.

```ts
app.get('/', async (c) => {
    const page = parseIntOr(c.req.query('page'), 1)
    const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200)
    const service = c.req.query('service')
    const from = parseDateStart(c.req.query('from'))
    const to = parseDateEnd(c.req.query('to'))
    // deps.adminDb.listLogEvents({ page, size, service: service || undefined, from, to, ... })
})
```

## 12. 정적 자산 / 캐시 헤더

- `/admin/styles.css`의 헤더는 `ADMIN_DESIGN_TOKENS_CACHE_HEADERS`(`page/admin/styles.ts`): `{ 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }`. **`immutable`은 없다.**
- 어드민 HTML 페이지에는 별도 `Cache-Control`을 설정하지 않는다(핸들러가 `c.html`만 반환). 보안 미들웨어가 `/admin`을 HTML 경로로 취급한다(`index.ts`의 `securityHtmlPaths: ['/admin']`) — 상세는 [architecture.md](./architecture.md).

```ts
app.get('/styles.css', (c) => c.body(ADMIN_DESIGN_TOKENS_CSS, { headers: ADMIN_DESIGN_TOKENS_CACHE_HEADERS }))
```

## 13. 파일 배치 요약

| 역할 | 파일 |
|------|------|
| 공통 레이아웃 · 공용 UI 컴포넌트 | `page/admin/components.tsx` (`AdminShell`, `DataTable`, `Badge`, `Pagination`, `FilterBar`, `RowAction`, `Stat`) |
| 정적 스타일(토큰 · 리셋 · 유틸 클래스) | `page/admin/styles.ts` (`ADMIN_DESIGN_TOKENS_CSS`, `ADMIN_DESIGN_TOKENS_CACHE_HEADERS`) |
| 가드 · 컨텍스트 타입 | `page/admin/guard.ts` (`requireAdminPage`, `AdminContext`, `AdminSessionUser`) |
| 쿼리/포맷 헬퍼 | `page/admin/format.ts` (`parseIntOr`, `parseDateStart`, `parseDateEnd`, `formatDate`, `formatDateShort`, `truncate`, `formatBytes`, `maskToken`, `ynLabel`, `clampPage`) |
| 페이지 라우트 | `page/admin/dashboard.tsx` · `page/admin/login.tsx` · `page/admin/pages/*.tsx` |
| 어드민 라우트 합류 | `page/admin/index.ts` (`createAdminRoute`) |
| 페이지 전체 합류 | `page/index.ts` (`createPage`) → root `index.ts`의 `createPage({ admin: { getSession, db, auth, triggerMailSync } })` |
| 공개 페이지(`hono/css`) | `page/home.tsx` · `page/policy.tsx` |

- 공통 레이아웃은 `<AdminShell>`(children) 직접 호출. jsxRenderer · CSR 없음.
- 디자인 토큰은 인라인 `<style>`이 아니라 외부 스타일시트 `/admin/styles.css`로 서빙. `hono/css`는 공개 home/policy 페이지에만.
