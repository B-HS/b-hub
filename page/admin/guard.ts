import type { Context, Next } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

export type AdminSessionUser = {
    id: string
    name: string
    email: string
    role: string | null
    image: string | null
}

export type AdminSession = { user: AdminSessionUser }

export type AdminGetSession = (c: Context) => Promise<AdminSession | null>

export type AdminContext = {
    Variables: {
        adminUser: AdminSessionUser
    }
}

const ADMIN_SESSION_VAR = 'adminSession'

export const cacheAdminSession = (c: Context, session: AdminSession | null) => c.set(ADMIN_SESSION_VAR, session)

/**
 * Resolves the request session once and reuses it for every later guard in the same request.
 */
export const resolveAdminSession = async (c: Context, getSession: AdminGetSession) => {
    const cached: AdminSession | null | undefined = c.get(ADMIN_SESSION_VAR)
    if (cached !== undefined) return cached
    const session = await getSession(c)
    cacheAdminSession(c, session)
    return session
}

export const REVEAL_COOKIE_NAME = 'hub_reveal'
const REVEAL_COOKIE_MAX_AGE_SECONDS = 60

export const setRevealValue = (c: Context, path: string, value: string) =>
    setCookie(c, REVEAL_COOKIE_NAME, value, {
        path,
        maxAge: REVEAL_COOKIE_MAX_AGE_SECONDS,
        httpOnly: true,
        sameSite: 'Lax',
        secure: process.env.NODE_ENV === 'production',
    })

/**
 * Reads the one-time reveal cookie and clears it so the secret is rendered only once.
 */
export const takeRevealValue = (c: Context, path: string) => {
    const value = getCookie(c, REVEAL_COOKIE_NAME)
    if (!value) return undefined
    deleteCookie(c, REVEAL_COOKIE_NAME, { path })
    return value
}

const renderForbidden = (c: Context, user: AdminSessionUser) =>
    c.html(
        `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Forbidden</title>` +
            `<link rel="stylesheet" href="/admin/styles.css"></head>` +
            `<body><div class="login-shell"><div class="login-card">` +
            `<div class="login-title">접근 권한 없음</div>` +
            `<p class="login-sub">${escapeHtml(user.email)} 계정에는 어드민 권한이 없습니다.</p>` +
            `<a class="btn outline" href="/">홈으로</a>` +
            `</div></div></body></html>`,
        403,
    )

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)

export const requireAdminPage =
    (getSession: AdminGetSession) =>
    async (c: Context, next: Next): Promise<Response | void> => {
        const session = await resolveAdminSession(c, getSession)
        if (!session) {
            const url = new URL(c.req.url)
            const next = url.pathname + url.search
            return c.redirect(`/admin/login?next=${encodeURIComponent(next)}`, 303)
        }
        if (session.user.role !== 'admin') return renderForbidden(c, session.user)
        c.set('adminUser', session.user)
        await next()
    }
