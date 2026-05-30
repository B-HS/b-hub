import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createUsersRoute } from '../../../page/admin/pages/users'
import { mockAdmin, sessionOf, stubAdminDb } from './helpers'

const sampleUser = {
    id: 'u-1',
    name: 'Sample',
    email: 'sample@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-01'),
    role: 'user',
    banned: false,
    banReason: null,
    banExpires: null,
    timezone: 'Asia/Seoul',
    storageQuotaBytes: 10 * 1024 * 1024,
}

const createApp = (overrides: Parameters<typeof stubAdminDb>[0] = {}) => {
    const app = new Hono()
    app.route(
        '/admin/users',
        createUsersRoute({
            getSession: sessionOf(mockAdmin),
            adminDb: stubAdminDb({
                listUsers: () =>
                    Promise.resolve({
                        rows: [
                            {
                                id: sampleUser.id,
                                email: sampleUser.email,
                                name: sampleUser.name,
                                role: sampleUser.role,
                                banned: sampleUser.banned,
                                createdAt: sampleUser.createdAt,
                                timezone: sampleUser.timezone,
                                storageQuotaBytes: sampleUser.storageQuotaBytes,
                            },
                        ],
                        total: 1,
                    }),
                getUser: (id) => Promise.resolve(id === sampleUser.id ? sampleUser : null),
                getUserAccounts: () => Promise.resolve([]),
                getUserSessions: () => Promise.resolve([]),
                ...overrides,
            }),
        }),
    )
    return app
}

describe('GET /admin/users (list)', () => {
    test('200과 사용자 이메일을 보여준다', async () => {
        const res = await createApp().request('/admin/users')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('sample@example.com')
        expect(html).toContain('1–1 / 1')
    })

    test('q 쿼리가 필터바에 prefill 된다', async () => {
        const res = await createApp().request('/admin/users?q=foo')
        const html = await res.text()
        expect(html).toContain('value="foo"')
    })
})

describe('GET /admin/users/:id (detail)', () => {
    test('상세 페이지에 프로필 카드가 노출된다', async () => {
        const res = await createApp().request('/admin/users/u-1')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('sample@example.com')
        expect(html).toContain('Storage Quota')
        expect(html).toContain('Ban 상태')
    })

    test('존재하지 않는 사용자는 404를 반환한다', async () => {
        const res = await createApp().request('/admin/users/missing')
        expect(res.status).toBe(404)
    })
})

describe('POST /admin/users/:id/role', () => {
    test('role을 변경하고 상세로 리다이렉트한다', async () => {
        const updateUserRole = mock(() => Promise.resolve())
        const app = createApp({ updateUserRole })
        const res = await app.request('/admin/users/u-1/role', {
            method: 'POST',
            body: new URLSearchParams({ role: 'admin' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/users/u-1?flash=ok')
        expect(updateUserRole).toHaveBeenCalledWith('u-1', 'admin')
    })

    test('잘못된 role은 user로 강제된다', async () => {
        const updateUserRole = mock(() => Promise.resolve())
        const app = createApp({ updateUserRole })
        await app.request('/admin/users/u-1/role', {
            method: 'POST',
            body: new URLSearchParams({ role: 'hacker' }),
        })
        expect(updateUserRole).toHaveBeenCalledWith('u-1', 'user')
    })
})

describe('POST /admin/users/:id/ban', () => {
    test('ban 액션은 banned=true와 reason을 전달한다', async () => {
        const updateUserBan = mock(() => Promise.resolve())
        const app = createApp({ updateUserBan })
        await app.request('/admin/users/u-1/ban', {
            method: 'POST',
            body: new URLSearchParams({ action: 'ban', reason: 'spam', expires: '2026-12-31' }),
        })
        expect(updateUserBan).toHaveBeenCalled()
        const callArgs = updateUserBan.mock.calls[0]
        expect(callArgs[0]).toBe('u-1')
        expect(callArgs[1]).toBe(true)
        expect(callArgs[2]).toBe('spam')
        expect(callArgs[3]).toBeInstanceOf(Date)
    })

    test('unban 액션은 reason과 expires를 null로 만든다', async () => {
        const updateUserBan = mock(() => Promise.resolve())
        const app = createApp({ updateUserBan })
        await app.request('/admin/users/u-1/ban', {
            method: 'POST',
            body: new URLSearchParams({ action: 'unban', reason: 'ignored', expires: '2026-12-31' }),
        })
        const callArgs = updateUserBan.mock.calls[0]
        expect(callArgs[1]).toBe(false)
        expect(callArgs[2]).toBe(null)
        expect(callArgs[3]).toBe(null)
    })
})

describe('POST /admin/users/:id/quota', () => {
    test('숫자 bytes로 quota를 변경한다', async () => {
        const updateUserQuota = mock(() => Promise.resolve())
        const app = createApp({ updateUserQuota })
        await app.request('/admin/users/u-1/quota', {
            method: 'POST',
            body: new URLSearchParams({ bytes: '12345' }),
        })
        expect(updateUserQuota).toHaveBeenCalledWith('u-1', 12345)
    })
})

describe('POST /admin/users/:id/sessions/:sid/revoke', () => {
    test('세션을 만료시키고 리다이렉트한다', async () => {
        const revokeSession = mock(() => Promise.resolve())
        const app = createApp({ revokeSession })
        const res = await app.request('/admin/users/u-1/sessions/s-1/revoke', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(revokeSession).toHaveBeenCalledWith('s-1')
    })
})

describe('POST /admin/users/:id/sessions/revoke-all', () => {
    test('모든 세션을 만료시키고 리다이렉트한다', async () => {
        const revokeAllUserSessions = mock(() => Promise.resolve())
        const app = createApp({ revokeAllUserSessions })
        const res = await app.request('/admin/users/u-1/sessions/revoke-all', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(revokeAllUserSessions).toHaveBeenCalledWith('u-1')
    })
})

describe('GET /admin/users/:id 최근 API 요청', () => {
    test('상세 페이지에 사용자 최근 API 요청 섹션이 노출된다', async () => {
        const getUserApiRequests = mock(() =>
            Promise.resolve([
                { id: 5, method: 'GET', path: '/api/blog/posts', statusCode: 200, durationMs: 14, errorCode: null, createdAt: new Date('2026-05-20') },
            ]),
        )
        const res = await createApp({ getUserApiRequests }).request('/admin/users/u-1')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('최근 API 요청')
        expect(html).toContain('/api/blog/posts')
        expect(getUserApiRequests).toHaveBeenCalledWith('u-1')
    })
})

describe('목록 파라미터 엣지케이스', () => {
    test('size는 5~100으로 클램프된다', async () => {
        const listUsers = mock(() => Promise.resolve({ rows: [], total: 0 }))
        await createApp({ listUsers }).request('/admin/users?size=999')
        expect(listUsers.mock.calls[0][0].size).toBe(100)
        const listUsers2 = mock(() => Promise.resolve({ rows: [], total: 0 }))
        await createApp({ listUsers: listUsers2 }).request('/admin/users?size=1')
        expect(listUsers2.mock.calls[0][0].size).toBe(5)
    })

    test('잘못된 page는 1로 폴백된다', async () => {
        const listUsers = mock(() => Promise.resolve({ rows: [], total: 0 }))
        await createApp({ listUsers }).request('/admin/users?page=abc')
        expect(listUsers.mock.calls[0][0].page).toBe(1)
    })

    test('q/role/banned 필터가 함께 전달된다', async () => {
        const listUsers = mock(() => Promise.resolve({ rows: [], total: 0 }))
        await createApp({ listUsers }).request('/admin/users?q=kim&role=admin&banned=y')
        const arg = listUsers.mock.calls[0][0]
        expect(arg.q).toBe('kim')
        expect(arg.role).toBe('admin')
        expect(arg.banned).toBe('y')
    })
})

describe('returnTo 오픈 리다이렉트 방지', () => {
    test('외부 도메인 returnTo는 무시하고 상세로 돌아간다', async () => {
        const res = await createApp().request('/admin/users/u-1/role', {
            method: 'POST',
            body: new URLSearchParams({ role: 'user', returnTo: 'https://evil.com' }),
        })
        expect(res.status).toBe(303)
        const location = res.headers.get('location') ?? ''
        expect(location.startsWith('/admin/users/u-1')).toBe(true)
        expect(location).not.toContain('evil.com')
    })

    test('admin 접두 returnTo는 보존된다', async () => {
        const res = await createApp().request('/admin/users/u-1/role', {
            method: 'POST',
            body: new URLSearchParams({ role: 'user', returnTo: '/admin/users?page=2' }),
        })
        expect(res.headers.get('location')).toContain('/admin/users?page=2')
    })
})
