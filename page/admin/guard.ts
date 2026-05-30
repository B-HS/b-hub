import type { Context, Next } from 'hono'

export type AdminSessionUser = {
    id: string
    name: string
    email: string
    role: string | null
    image: string | null
}

export type AdminGetSession = (c: Context) => Promise<{ user: AdminSessionUser } | null>

export type AdminContext = {
    Variables: {
        adminUser: AdminSessionUser
    }
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

const escapeHtml = (s: string) =>
    s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)

export const requireAdminPage =
    (getSession: AdminGetSession) =>
    async (c: Context, next: Next): Promise<Response | void> => {
        const session = await getSession(c)
        if (!session) {
            const url = new URL(c.req.url)
            const next = url.pathname + url.search
            return c.redirect(`/admin/login?next=${encodeURIComponent(next)}`, 303)
        }
        if (session.user.role !== 'admin') return renderForbidden(c, session.user)
        c.set('adminUser', session.user)
        await next()
    }
