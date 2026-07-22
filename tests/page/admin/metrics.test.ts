import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createMetricsTokensRoute } from '../../../page/admin/pages/metrics'
import { mockAdmin, mockUser, sessionOf } from './helpers'
import type { MetricsTokenService } from '../../../service/domain/metrics/token'

const sampleRow = {
    id: 1,
    token: 'hash',
    alias: 'demo-mbp',
    scope: 'client',
    dailyLimit: 20000,
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date('2026-07-22T00:00:00Z'),
}

const stubService = (overrides: Partial<Record<keyof MetricsTokenService, unknown>> = {}) =>
    ({
        create: mock(() => Promise.resolve({ id: 2, token: 'plain-token-value' })),
        validate: mock(() => Promise.resolve(null)),
        checkRateLimit: mock(() => Promise.resolve(true)),
        revoke: mock(() => Promise.resolve(true)),
        listAll: mock(() => Promise.resolve([sampleRow])),
        ...overrides,
    }) as never

const createApp = (sessionUser: typeof mockAdmin | null, metricsTokenService?: MetricsTokenService) => {
    const app = new Hono()
    app.route('/admin/metrics/tokens', createMetricsTokensRoute({ getSession: sessionOf(sessionUser), metricsTokenService }))
    return app
}

describe('Admin Metrics Tokens page', () => {
    test('관리자 list GET은 200과 토큰 행을 렌더한다', async () => {
        const res = await createApp(mockAdmin, stubService()).request('/admin/metrics/tokens')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('demo-mbp')
        expect(html).toContain('새 토큰 발급')
    })

    test('서비스 미주입(MONGODB_URI 없음)이면 미구성 안내를 렌더한다', async () => {
        const res = await createApp(mockAdmin).request('/admin/metrics/tokens')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('MONGODB_URI')
    })

    test('POST 발급은 평문 토큰을 1회 렌더한다', async () => {
        const service = stubService()
        const app = createApp(mockAdmin, service)
        const res = await app.request('/admin/metrics/tokens', {
            method: 'POST',
            body: new URLSearchParams({ alias: 'new-device', scope: 'admin', expiresInDays: '30' }),
        })
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('plain-token-value')
        const input = (service as { create: { mock: { calls: unknown[][] } } }).create.mock.calls[0][0] as {
            alias: string
            scope: string
            expiresInDays?: number
        }
        expect(input.alias).toBe('new-device')
        expect(input.scope).toBe('admin')
        expect(input.expiresInDays).toBe(30)
    })

    test('POST 발급에 alias가 없으면 validation 에러로 303한다', async () => {
        const res = await createApp(mockAdmin, stubService()).request('/admin/metrics/tokens', {
            method: 'POST',
            body: new URLSearchParams({ scope: 'client' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('flash=err')
    })

    test('POST revoke는 303 flash=ok로 리다이렉트한다', async () => {
        const service = stubService()
        const res = await createApp(mockAdmin, service).request('/admin/metrics/tokens/1/revoke', {
            method: 'POST',
            body: new URLSearchParams(),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('flash=ok')
        expect((service as { revoke: { mock: { calls: unknown[][] } } }).revoke.mock.calls[0][0]).toBe(1)
    })

    test('미인증은 303 로그인, 비관리자는 403이다', async () => {
        const anon = await createApp(null, stubService()).request('/admin/metrics/tokens')
        expect(anon.status).toBe(303)
        expect(anon.headers.get('location')).toContain('/admin/login')

        const forbidden = await createApp(mockUser as never, stubService()).request('/admin/metrics/tokens')
        expect(forbidden.status).toBe(403)
    })
})
