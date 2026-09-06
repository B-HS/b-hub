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

    test('ban 액션은 해당 사용자의 세션을 모두 회수한다', async () => {
        const revokeAllUserSessions = mock(() => Promise.resolve())
        const app = createApp({ revokeAllUserSessions })
        await app.request('/admin/users/u-1/ban', { method: 'POST', body: new URLSearchParams({ action: 'ban' }) })
        expect(revokeAllUserSessions).toHaveBeenCalledWith('u-1')
    })

    test('unban 액션은 세션을 회수하지 않는다', async () => {
        const revokeAllUserSessions = mock(() => Promise.resolve())
        const app = createApp({ revokeAllUserSessions })
        await app.request('/admin/users/u-1/ban', { method: 'POST', body: new URLSearchParams({ action: 'unban' }) })
        expect(revokeAllUserSessions).not.toHaveBeenCalled()
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
                {
                    id: 5,
                    method: 'GET',
                    path: '/api/blog/posts',
                    statusCode: 200,
                    durationMs: 14,
                    errorCode: null,
                    createdAt: new Date('2026-05-20'),
                },
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

describe('GET /admin/users 페이지 파라미터 보정', () => {
    test('page=0 / -3 / abc 는 500 없이 1페이지로 조회한다', async () => {
        for (const value of ['0', '-3', 'abc']) {
            const listUsers = mock(() => Promise.resolve({ rows: [], total: 0 }))
            const res = await createApp({ listUsers }).request(`/admin/users?page=${value}`)
            expect(res.status).toBe(200)
            expect((listUsers.mock.calls[0] as unknown as [{ page: number }])[0].page).toBe(1)
        }
    })

    test('총 페이지를 넘는 page 도 오류 없이 200 이다', async () => {
        const res = await createApp().request('/admin/users?page=9999')
        expect(res.status).toBe(200)
    })
})

describe('POST /admin/users/:id/ban 입력 검증', () => {
    test('만료일이 유효하지 않으면 validation flash 로 리다이렉트하고 저장하지 않는다', async () => {
        const updateUserBan = mock(() => Promise.resolve())
        const res = await createApp({ updateUserBan }).request('/admin/users/u-1/ban', {
            method: 'POST',
            body: new URLSearchParams({ action: 'ban', expires: 'not-a-date' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/admin/users/u-1?flash=err&code=validation')
        expect(updateUserBan).not.toHaveBeenCalled()
    })

    test('유효한 만료일은 그대로 저장한다', async () => {
        const updateUserBan = mock(() => Promise.resolve())
        const res = await createApp({ updateUserBan }).request('/admin/users/u-1/ban', {
            method: 'POST',
            body: new URLSearchParams({ action: 'ban', expires: '2026-12-31' }),
        })
        expect(res.headers.get('location')).toBe('/admin/users/u-1?flash=ok')
        expect(updateUserBan.mock.calls[0][3]).toBeInstanceOf(Date)
    })
})

describe('POST /admin/users/:id/quota 입력 검증', () => {
    test('음수 bytes 는 validation flash 로 거부한다', async () => {
        const updateUserQuota = mock(() => Promise.resolve())
        const res = await createApp({ updateUserQuota }).request('/admin/users/u-1/quota', {
            method: 'POST',
            body: new URLSearchParams({ bytes: '-1' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/admin/users/u-1?flash=err&code=validation')
        expect(updateUserQuota).not.toHaveBeenCalled()
    })

    test('숫자가 아닌 bytes 는 기존 동작대로 0 으로 저장한다', async () => {
        const updateUserQuota = mock(() => Promise.resolve())
        const res = await createApp({ updateUserQuota }).request('/admin/users/u-1/quota', {
            method: 'POST',
            body: new URLSearchParams({ bytes: 'abc' }),
        })
        expect(res.headers.get('location')).toBe('/admin/users/u-1?flash=ok')
        expect(updateUserQuota).toHaveBeenCalledWith('u-1', 0)
    })
})
