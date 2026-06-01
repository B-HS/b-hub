import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createDashboardRoute } from '../../../page/admin/dashboard'
import { mockAdmin, mockUser, sessionOf, stubAdminDb } from './helpers'

const createApp = (sessionUser: typeof mockAdmin | typeof mockUser | null) => {
    const app = new Hono()
    app.route(
        '/admin',
        createDashboardRoute({
            getSession: sessionOf(sessionUser),
            adminDb: stubAdminDb({
                counts: () =>
                    Promise.resolve({
                        users: 42,
                        posts: 7,
                        comments: 5,
                        messages: 3,
                        mailAccounts: 2,
                        spotifyAccounts: 1,
                        resumes: 1,
                        calendarEvents: 9,
                        driveAssets: 4,
                        apiTokens: 6,
                        activeSessions: 8,
                        requests24h: 100,
                        errors24h: 2,
                        weatherLogs: 11,
                        logEvents24h: 13,
                        logErrors24h: 3,
                        storageBytes: 1024 * 1024 * 50,
                    }),
                recentUsers: () =>
                    Promise.resolve([
                        { id: 'u-1', email: 'recent@example.com', name: 'Recent', role: 'user', createdAt: new Date('2026-05-25') },
                    ]),
                recentRequests: () =>
                    Promise.resolve([
                        {
                            id: 1,
                            method: 'GET',
                            path: '/api/health',
                            statusCode: 200,
                            userId: null,
                            durationMs: 12,
                            createdAt: new Date('2026-05-25'),
                            errorCode: null,
                        },
                    ]),
                recentErrors: () =>
                    Promise.resolve([
                        {
                            id: 99,
                            method: 'POST',
                            path: '/api/blog/posts',
                            statusCode: 500,
                            userId: 'u-err',
                            durationMs: 30,
                            createdAt: new Date('2026-05-26'),
                            errorCode: 'BLOG_POST_NOT_FOUND',
                        },
                    ]),
            }),
        }),
    )
    return app
}

describe('GET /admin (dashboard)', () => {
    test('관리자는 200과 통계 카드들을 본다', async () => {
        const res = await createApp(mockAdmin).request('/admin')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('Dashboard')
        expect(html).toContain('Users')
        expect(html).toContain('42')
        expect(html).toContain('recent@example.com')
        expect(html).toContain('/api/health')
        expect(html).toContain('50 MB')
    })

    test('weather logs 카운트와 최근 에러 섹션을 보여준다', async () => {
        const res = await createApp(mockAdmin).request('/admin')
        const html = await res.text()
        expect(html).toContain('Weather Logs')
        expect(html).toContain('11')
        expect(html).toContain('최근 에러')
        expect(html).toContain('/api/blog/posts')
        expect(html).toContain('BLOG_POST_NOT_FOUND')
    })

    test('미인증은 로그인으로 리다이렉트한다', async () => {
        const res = await createApp(null).request('/admin')
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/login')
    })

    test('비관리자는 403을 받는다', async () => {
        const res = await createApp(mockUser).request('/admin')
        expect(res.status).toBe(403)
    })

    test('사이드바 네비게이션이 포함된다', async () => {
        const res = await createApp(mockAdmin).request('/admin')
        const html = await res.text()
        expect(html).toContain('/admin/users')
        expect(html).toContain('/admin/blog/posts')
        expect(html).toContain('/admin/calendar/events')
    })
})
