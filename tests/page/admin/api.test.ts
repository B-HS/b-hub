import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createApiLogsRoute, createApiTokensRoute } from '../../../page/admin/pages/api'
import { mockAdmin, sessionOf, stubAdminDb } from './helpers'

const sampleToken = {
    id: 7,
    token: 'abcd1234567890wxyz',
    name: 'CI Token',
    userId: 'u-1',
    userEmail: 'owner@example.com',
    expiresAt: new Date('2026-12-31'),
    lastUsedAt: new Date('2026-05-20'),
    createdAt: new Date('2026-05-01'),
}

const sampleLog = {
    id: 11,
    method: 'GET',
    path: '/api/weather/current',
    statusCode: 200,
    userId: 'u-1',
    ip: '127.0.0.1',
    durationMs: 42,
    errorCode: null,
    createdAt: new Date('2026-05-10'),
}

const createTokensApp = (overrides: Parameters<typeof stubAdminDb>[0] = {}) => {
    const app = new Hono()
    app.route(
        '/admin/api/tokens',
        createApiTokensRoute({
            getSession: sessionOf(mockAdmin),
            adminDb: stubAdminDb({
                listApiTokens: () => Promise.resolve({ rows: [sampleToken], total: 1 }),
                ...overrides,
            }),
        }),
    )
    return app
}

const createLogsApp = (overrides: Parameters<typeof stubAdminDb>[0] = {}) => {
    const app = new Hono()
    app.route(
        '/admin/api/logs',
        createApiLogsRoute({
            getSession: sessionOf(mockAdmin),
            adminDb: stubAdminDb({
                listApiLogs: () => Promise.resolve({ rows: [sampleLog], total: 1 }),
                ...overrides,
            }),
        }),
    )
    return app
}

describe('GET /admin/api/tokens (list)', () => {
    test('200과 사용자 이메일을 보여준다', async () => {
        const res = await createTokensApp().request('/admin/api/tokens')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('owner@example.com')
        expect(html).toContain('1–1 / 1')
    })

    test('토큰은 마스킹되어 원본 전체가 노출되지 않는다', async () => {
        const res = await createTokensApp().request('/admin/api/tokens')
        const html = await res.text()
        expect(html).not.toContain('abcd1234567890wxyz')
        expect(html).toContain('abcd…wxyz')
    })

    test('q 쿼리가 필터바에 prefill 된다', async () => {
        const res = await createTokensApp().request('/admin/api/tokens?q=owner')
        const html = await res.text()
        expect(html).toContain('value="owner"')
    })

    test('size는 최소 5로 클램프된다', async () => {
        const listApiTokens = mock(() => Promise.resolve({ rows: [sampleToken], total: 1 }))
        const app = createTokensApp({ listApiTokens })
        await app.request('/admin/api/tokens?size=1')
        expect(listApiTokens.mock.calls[0][0].size).toBe(5)
    })

    test('size는 최대 100으로 클램프된다', async () => {
        const listApiTokens = mock(() => Promise.resolve({ rows: [sampleToken], total: 1 }))
        const app = createTokensApp({ listApiTokens })
        await app.request('/admin/api/tokens?size=9999')
        expect(listApiTokens.mock.calls[0][0].size).toBe(100)
    })

    test('잘못된 page는 1로 기본 처리된다', async () => {
        const listApiTokens = mock(() => Promise.resolve({ rows: [sampleToken], total: 1 }))
        const app = createTokensApp({ listApiTokens })
        const res = await app.request('/admin/api/tokens?page=abc')
        expect(res.status).toBe(200)
        expect(listApiTokens.mock.calls[0][0].page).toBe(1)
    })
})

describe('POST /admin/api/tokens/:id/revoke', () => {
    test('revokeApiToken을 파싱된 정수로 호출하고 리다이렉트한다', async () => {
        const revokeApiToken = mock(() => Promise.resolve())
        const app = createTokensApp({ revokeApiToken })
        const res = await app.request('/admin/api/tokens/7/revoke', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        const location = res.headers.get('location') ?? ''
        expect(location).toContain('/admin/api/tokens')
        expect(location).toContain('flash=ok')
        expect(revokeApiToken).toHaveBeenCalledWith(7)
    })

    test('id 0은 revokeApiToken을 호출하지 않지만 303을 반환한다', async () => {
        const revokeApiToken = mock(() => Promise.resolve())
        const app = createTokensApp({ revokeApiToken })
        const res = await app.request('/admin/api/tokens/0/revoke', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(revokeApiToken).not.toHaveBeenCalled()
    })

    test('내부 returnTo는 그대로 사용된다', async () => {
        const revokeApiToken = mock(() => Promise.resolve())
        const app = createTokensApp({ revokeApiToken })
        const res = await app.request('/admin/api/tokens/7/revoke', {
            method: 'POST',
            body: new URLSearchParams({ returnTo: '/admin/api/tokens?page=2&size=20' }),
        })
        const location = res.headers.get('location') ?? ''
        expect(location).toContain('/admin/api/tokens?page=2&size=20')
        expect(location).toContain('flash=ok')
    })

    test('외부 returnTo는 거부되고 기본 경로로 폴백한다', async () => {
        const revokeApiToken = mock(() => Promise.resolve())
        const app = createTokensApp({ revokeApiToken })
        const res = await app.request('/admin/api/tokens/7/revoke', {
            method: 'POST',
            body: new URLSearchParams({ returnTo: 'https://evil.com' }),
        })
        const location = res.headers.get('location') ?? ''
        expect(location).not.toContain('evil.com')
        expect(location).toContain('/admin/api/tokens')
        expect(location).toContain('flash=ok')
    })
})

describe('GET /admin/api/logs (list)', () => {
    test('200과 요청 경로를 노출한다', async () => {
        const res = await createLogsApp().request('/admin/api/logs')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('/api/weather/current')
        expect(html).toContain('1–1 / 1')
    })

    test('필터 쿼리(path/status/userId/from/to)가 prefill 된다', async () => {
        const res = await createLogsApp().request('/admin/api/logs?path=/api/weather&status=200&userId=u-1&from=2026-01-01&to=2026-01-31')
        const html = await res.text()
        expect(html).toContain('value="/api/weather"')
        expect(html).toContain('value="200"')
        expect(html).toContain('value="u-1"')
        expect(html).toContain('value="2026-01-01"')
        expect(html).toContain('value="2026-01-31"')
    })

    test('from/to 날짜 범위를 넘겨도 200을 반환한다', async () => {
        const listApiLogs = mock(() => Promise.resolve({ rows: [sampleLog], total: 1 }))
        const app = createLogsApp({ listApiLogs })
        const res = await app.request('/admin/api/logs?from=2026-01-01&to=2026-01-31')
        expect(res.status).toBe(200)
        const args = listApiLogs.mock.calls[0][0]
        expect(args.from).toBeInstanceOf(Date)
        expect(args.to).toBeInstanceOf(Date)
    })

    test('size는 최소 5로 클램프된다', async () => {
        const listApiLogs = mock(() => Promise.resolve({ rows: [sampleLog], total: 1 }))
        const app = createLogsApp({ listApiLogs })
        await app.request('/admin/api/logs?size=1')
        expect(listApiLogs.mock.calls[0][0].size).toBe(5)
    })

    test('size는 최대 200으로 클램프된다', async () => {
        const listApiLogs = mock(() => Promise.resolve({ rows: [sampleLog], total: 1 }))
        const app = createLogsApp({ listApiLogs })
        await app.request('/admin/api/logs?size=9999')
        expect(listApiLogs.mock.calls[0][0].size).toBe(200)
    })

    test('잘못된 page는 1로 기본 처리된다', async () => {
        const listApiLogs = mock(() => Promise.resolve({ rows: [sampleLog], total: 1 }))
        const app = createLogsApp({ listApiLogs })
        const res = await app.request('/admin/api/logs?page=abc')
        expect(res.status).toBe(200)
        expect(listApiLogs.mock.calls[0][0].page).toBe(1)
    })
})
