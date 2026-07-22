import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createAdminRoute } from '../../../page/admin'
import { mockAdmin, mockUser, sessionOf, stubAdminDb } from './helpers'

const createApp = (sessionUser: typeof mockAdmin | typeof mockUser | null) => {
    const app = new Hono()
    app.route(
        '/admin',
        createAdminRoute({
            getSession: sessionOf(sessionUser),
            adminDb: stubAdminDb(),
        }),
    )
    return app
}

const adminRoutes = [
    '/admin',
    '/admin/users',
    '/admin/sessions',
    '/admin/api/tokens',
    '/admin/api/logs',
    '/admin/blog/posts',
    '/admin/blog/comments',
    '/admin/blog/categories',
    '/admin/blog/tags',
    '/admin/blog/images',
    '/admin/messages',
    '/admin/messages/follows',
    '/admin/weather/keys',
    '/admin/weather/logs',
    '/admin/weather/cache',
    '/admin/mail/accounts',
    '/admin/mail/sync-logs',
    '/admin/mail/sync-sessions',
    '/admin/mail/messages',
    '/admin/mail/uploads',
    '/admin/spotify/accounts',
    '/admin/spotify/keys',
    '/admin/spotify/widget-tokens',
    '/admin/metrics/tokens',
    '/admin/resumes',
    '/admin/calendar/events',
    '/admin/calendar/groups',
    '/admin/calendar/subscriptions',
    '/admin/calendar/deleted',
    '/admin/drive/assets',
    '/admin/drive/folders',
    '/admin/drive/lifecycle-logs',
]

describe('Admin route bundling', () => {
    test('관리자에게 모든 list 라우트가 200을 반환한다', async () => {
        const app = createApp(mockAdmin)
        for (const path of adminRoutes) {
            const res = await app.request(path)
            expect(res.status).toBe(200)
            const html = await res.text()
            expect(html).toContain('<html')
        }
    })

    test('미인증 사용자는 모든 list 라우트에서 /admin/login으로 리다이렉트한다', async () => {
        const app = createApp(null)
        for (const path of adminRoutes) {
            const res = await app.request(path)
            expect(res.status).toBe(303)
            expect(res.headers.get('location')).toContain('/admin/login')
        }
    })

    test('비관리자는 모든 list 라우트에서 403을 받는다', async () => {
        const app = createApp(mockUser)
        for (const path of adminRoutes) {
            const res = await app.request(path)
            expect(res.status).toBe(403)
        }
    })

    test('GET /admin/styles.css는 인증 없이도 200을 반환한다', async () => {
        const app = createApp(null)
        const res = await app.request('/admin/styles.css')
        expect(res.status).toBe(200)
    })

    test('GET /admin/login은 인증 없이 200을 반환한다', async () => {
        const app = createApp(null)
        const res = await app.request('/admin/login')
        expect(res.status).toBe(200)
    })
})
