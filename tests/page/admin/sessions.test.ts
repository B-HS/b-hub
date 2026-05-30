import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createSessionsRoute } from '../../../page/admin/pages/sessions'
import { mockAdmin, sessionOf, stubAdminDb } from './helpers'

const sampleSession = {
    id: 's-1',
    userId: 'u-1',
    userEmail: 'sample@example.com',
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0 TestAgent',
    createdAt: new Date('2026-05-01'),
    expiresAt: new Date('2026-06-01'),
}

const createApp = (overrides: Parameters<typeof stubAdminDb>[0] = {}) => {
    const app = new Hono()
    app.route(
        '/admin/sessions',
        createSessionsRoute({
            getSession: sessionOf(mockAdmin),
            adminDb: stubAdminDb({
                listSessions: () => Promise.resolve({ rows: [sampleSession], total: 1 }),
                ...overrides,
            }),
        }),
    )
    return app
}

describe('GET /admin/sessions (list)', () => {
    test('200과 세션 사용자 이메일을 보여준다', async () => {
        const res = await createApp().request('/admin/sessions')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('sample@example.com')
        expect(html).toContain('1–1 / 1')
    })

    test('userId 링크와 IP/UA 셀이 노출된다', async () => {
        const res = await createApp().request('/admin/sessions')
        const html = await res.text()
        expect(html).toContain('/admin/users/u-1')
        expect(html).toContain('127.0.0.1')
        expect(html).toContain('Mozilla/5.0 TestAgent')
    })

    test('q 쿼리가 필터바에 prefill 된다', async () => {
        const res = await createApp().request('/admin/sessions?q=foo')
        const html = await res.text()
        expect(html).toContain('value="foo"')
    })
})

describe('POST /admin/sessions/:id/revoke', () => {
    test('세션을 만료시키고 303 + flash=ok로 리다이렉트한다', async () => {
        const revokeSession = mock(() => Promise.resolve())
        const app = createApp({ revokeSession })
        const res = await app.request('/admin/sessions/s-1/revoke', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        const location = res.headers.get('location') ?? ''
        expect(location).toContain('/admin/sessions')
        expect(location).toContain('flash=ok')
        expect(revokeSession).toHaveBeenCalledWith('s-1')
    })

    test('외부 도메인 returnTo는 무시하고 /admin/sessions로 돌아간다', async () => {
        const res = await createApp().request('/admin/sessions/s-1/revoke', {
            method: 'POST',
            body: new URLSearchParams({ returnTo: 'https://evil.com' }),
        })
        expect(res.status).toBe(303)
        const location = res.headers.get('location') ?? ''
        expect(location.startsWith('/admin/sessions')).toBe(true)
        expect(location).not.toContain('evil.com')
        expect(location).toContain('flash=ok')
    })

    test('admin 접두 returnTo는 보존되고 &flash=ok가 붙는다', async () => {
        const res = await createApp().request('/admin/sessions/s-1/revoke', {
            method: 'POST',
            body: new URLSearchParams({ returnTo: '/admin/sessions?page=2' }),
        })
        expect(res.status).toBe(303)
        const location = res.headers.get('location') ?? ''
        expect(location).toContain('/admin/sessions?page=2')
        expect(location).toContain('&flash=ok')
    })
})

describe('POST /admin/sessions/user/:userId/revoke-all', () => {
    test('해당 유저의 모든 세션을 만료시키고 303 + flash=ok로 리다이렉트한다', async () => {
        const revokeAllUserSessions = mock(() => Promise.resolve())
        const app = createApp({ revokeAllUserSessions })
        const res = await app.request('/admin/sessions/user/u-1/revoke-all', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        const location = res.headers.get('location') ?? ''
        expect(location).toContain('/admin/sessions')
        expect(location).toContain('flash=ok')
        expect(revokeAllUserSessions).toHaveBeenCalledWith('u-1')
    })

    test('외부 도메인 returnTo는 무시된다', async () => {
        const res = await createApp().request('/admin/sessions/user/u-1/revoke-all', {
            method: 'POST',
            body: new URLSearchParams({ returnTo: 'https://evil.com' }),
        })
        expect(res.status).toBe(303)
        const location = res.headers.get('location') ?? ''
        expect(location.startsWith('/admin/sessions')).toBe(true)
        expect(location).not.toContain('evil.com')
    })
})

describe('목록 파라미터 엣지케이스', () => {
    test('size는 5~100으로 클램프된다', async () => {
        const listUsersMax = mock(() => Promise.resolve({ rows: [], total: 0 }))
        await createApp({ listSessions: listUsersMax }).request('/admin/sessions?size=999')
        expect(listUsersMax.mock.calls[0][0].size).toBe(100)

        const listUsersMin = mock(() => Promise.resolve({ rows: [], total: 0 }))
        await createApp({ listSessions: listUsersMin }).request('/admin/sessions?size=1')
        expect(listUsersMin.mock.calls[0][0].size).toBe(5)
    })

    test('잘못된 page는 1로 폴백된다', async () => {
        const listSessions = mock(() => Promise.resolve({ rows: [], total: 0 }))
        await createApp({ listSessions }).request('/admin/sessions?page=abc')
        expect(listSessions.mock.calls[0][0].page).toBe(1)
    })

    test('q 필터가 listSessions로 전달된다', async () => {
        const listSessions = mock(() => Promise.resolve({ rows: [], total: 0 }))
        await createApp({ listSessions }).request('/admin/sessions?q=kim')
        expect(listSessions.mock.calls[0][0].q).toBe('kim')
    })
})
