# Hono SSR Admin Page — 핵심 레퍼런스

본 hyun-hub 프로젝트 어드민 페이지 작성용으로 정제된 Hono 기능 요약. 모든 페이지는 **CSR 없음, SSR만**.

---

## 1. JSX 렌더링 (Hono JSX, React 아님)

- 파일 확장자 `.tsx`, `tsconfig.json`의 `jsxImportSource: 'hono/jsx'`.
- 컴포넌트는 함수이며 Children, Fragment, Boolean 분기 모두 지원.
- 응답: `c.html(<Page />)` — `<!DOCTYPE html>`은 자동으로 붙지 않으므로 직접 첫 줄에 작성.

```tsx
const Page = () => (
    <html lang='ko'>
        <head>
            <meta charset='UTF-8' />
            <title>Admin</title>
        </head>
        <body>...</body>
    </html>
)

app.get('/admin', (c) => c.html(<Page />))
```

## 2. `hono/css` (스타일 인젝션)

- `css` 태그드 템플릿 → 클래스명 반환.
- 페이지 안에 `<Style />` 컴포넌트를 1회 렌더하면 모든 `css` 블록이 합쳐져 head/body에 주입됨.
- 클래스명 충돌 안전, CSS-in-JS 방식.

```tsx
import { css, Style } from 'hono/css'

const button = css`
    padding: 0.5rem 1rem;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    &:hover {
        background: color-mix(in oklch, var(--color-primary) 90%, transparent);
    }
`

const Page = () => (
    <html>
        <head>
            <Style />
        </head>
        <body>
            <button class={button}>OK</button>
        </body>
    </html>
)
```

- **글로벌 스타일**(`:root`, `*`, `body`)은 별도 `<style>` 태그로 head 안에 직접 작성하거나 `raw()`로 삽입.

## 3. JSX Renderer 미들웨어 (선택사항)

`hono/jsx-renderer`로 레이아웃을 미들웨어처럼 등록 가능.

```tsx
import { jsxRenderer } from 'hono/jsx-renderer'

app.use('/admin/*', jsxRenderer(({ children, title }) => (
    <html>
        <head><title>{title as string}</title></head>
        <body>{children}</body>
    </html>
)))

app.get('/admin', (c) => c.render(<h1>Dashboard</h1>, { title: 'Dashboard' }))
```

본 프로젝트에서는 **직접 레이아웃 컴포넌트 호출**을 선호 (page/home.tsx 패턴과 일치).

## 4. 타입드 컨텍스트 (Variables)

```ts
type AdminContext = { Variables: { user: { id: string; role: string } } }
const admin = new Hono<AdminContext>()

admin.use('*', async (c, next) => {
    c.set('user', { id: '...', role: 'admin' })
    await next()
})
admin.get('/', (c) => c.text(c.get('user').role))
```

## 5. 폼 / 쿼리 파라미터

- `await c.req.parseBody()` — `application/x-www-form-urlencoded` & `multipart/form-data`.
- `c.req.query('q')` — 단일 쿼리, `c.req.queries('tag')` — 다중.
- `c.req.param('id')` — path param.

```tsx
app.post('/admin/posts/:id/hide', async (c) => {
    const { reason } = await c.req.parseBody<{ reason: string }>()
    const id = c.req.param('id')
    // ...
    return c.redirect(`/admin/posts/${id}`, 303)
})
```

## 6. 응답 헬퍼

- `c.html(node)` → `text/html; charset=UTF-8`
- `c.redirect(url, 303)` — SSR 폼 POST 후 GET 리다이렉트 패턴
- `c.json(obj)`, `c.text(s)`, `c.body(buf, { headers })`
- `c.notFound()` → 404, `c.status(403)` → 상태만 변경

## 7. 라우터 합치기 / basePath

```ts
const adminPages = new Hono<AdminContext>()
adminPages.get('/', dashboard)
adminPages.get('/users', usersList)

const app = new Hono()
app.route('/admin', adminPages)
// 결과: GET /admin, GET /admin/users
```

체이닝: `app.get(...).post(...).delete(...)` 가능.

## 8. 미들웨어 작성

```ts
app.use('/admin/*', async (c, next) => {
    const session = await getSession(c)
    if (!session) return c.redirect('/admin/login', 303)
    if (session.user.role !== 'admin') return c.html(<Forbidden />, 403)
    c.set('user', session.user)
    await next()
})
```

- 가드는 `next()` 호출 여부로 통과/차단을 결정.
- 미들웨어 안에서 응답을 직접 반환해도 됨 (`return c.html(...)`).

## 9. HTML 이스케이프

- JSX는 기본적으로 모든 텍스트를 자동 이스케이프 (XSS 안전).
- `html` 헬퍼: 템플릿 리터럴 안에서 `${userInput}` 자동 이스케이프.
- **`raw()`** 또는 JSX의 `dangerouslySetInnerHTML`은 신뢰된 HTML(예: 디자인 토큰 CSS 문자열)에만 사용.

```tsx
import { raw } from 'hono/html'

const css = ':root { --color-primary: oklch(0.205 0 0); }'
<style>{raw(css)}</style>
```

## 10. 폼 → 서버 흐름 (CSR 없이 데이터 변경)

1. `<form method="post" action="/admin/posts/:id/hide">` 으로 변경 의도 전달.
2. 핸들러에서 처리 후 `c.redirect(returnUrl, 303)` — POST/Redirect/GET 패턴.
3. 결과/플래시 메시지가 필요하면 query string에 `?status=ok` 같은 힌트를 붙여 다음 GET에서 렌더.

## 11. 페이지네이션 & 필터

- 모든 상태는 URL query에 인코딩 — 북마크/뒤로가기 친화.
- 쿼리 검증은 기존 `dto/*` Zod 스키마 재사용 가능.

```ts
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    size: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().optional(),
})

admin.get('/posts', zValidator('query', querySchema), async (c) => {
    const { page, size, q } = c.req.valid('query')
    // ...
})
```

## 12. 정적 자산 / 캐시 헤더

- 디자인 토큰 CSS: `Cache-Control: public, max-age=86400, immutable`.
- 페이지 자체: `Cache-Control: private, no-store` (세션 의존).

```ts
app.get('/admin/styles.css', (c) => c.body(CSS, { headers: { 'Content-Type': 'text/css', 'Cache-Control': 'public, max-age=86400' } }))
```

## 13. 이 프로젝트의 패턴 (page/home.tsx 참고)

- 페이지 컴포넌트는 `(/page/*.tsx)`에 모으고, `createPage()`에서 라우터로 합친다.
- 페이지 간 공통 레이아웃은 `<AdminShell>` JSX 컴포넌트로 추출하고 `children`을 props로 받는다.
- 디자인 토큰(`:root { --color-* }`)은 `<style>` 태그에 직접 인라인 — `hono/css`로 클래스화하기보다 토큰은 글로벌이 합리적.
