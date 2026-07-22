import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { requireMetricsToken } from '../../middleware/require-metrics-token'
import { errorHandler } from '../../middleware/error-handler'
import type { MetricsTokenScope } from '../../dto/metrics/token'

const record = (scope: string) => ({ id: 1, alias: 'demo-mbp', scope, dailyLimit: 20000 })

const createApp = (deps: {
    validate: (t: string) => Promise<unknown>
    checkRateLimit?: () => Promise<boolean>
    scope: MetricsTokenScope
    checkRateLimitEnabled?: boolean
}) => {
    const app = new Hono()
    app.use('*', errorHandler())
    app.use(
        '*',
        requireMetricsToken({
            metricsTokenService: { validate: deps.validate, checkRateLimit: deps.checkRateLimit ?? (() => Promise.resolve(true)) } as never,
            scope: deps.scope,
            checkRateLimit: deps.checkRateLimitEnabled,
        }),
    )
    app.get('/test', (c) => c.json({ tokenId: c.get('metricsTokenId' as never), alias: c.get('metricsTokenAlias' as never) }))
    return app
}

describe('requireMetricsToken middleware', () => {
    test('토큰 헤더 누락 시 401을 반환한다', async () => {
        const app = createApp({ validate: mock(async () => record('client')), scope: 'client' })
        const res = await app.request('/test')
        expect(res.status).toBe(401)
    })

    test('무효 토큰이면 401을 반환한다', async () => {
        const app = createApp({ validate: mock(async () => null), scope: 'client' })
        const res = await app.request('/test', { headers: { Authorization: 'Bearer bad' } })
        expect(res.status).toBe(401)
    })

    test('admin scope 요구 엔드포인트에 client 토큰이면 403을 반환한다', async () => {
        const app = createApp({ validate: mock(async () => record('client')), scope: 'admin' })
        const res = await app.request('/test', { headers: { Authorization: 'Bearer t' } })
        expect(res.status).toBe(403)
    })

    test('client scope 요구 엔드포인트는 admin 토큰도 통과한다', async () => {
        const app = createApp({ validate: mock(async () => record('admin')), scope: 'client' })
        const res = await app.request('/test', { headers: { Authorization: 'Bearer t' } })
        expect(res.status).toBe(200)
    })

    test('Bearer와 X-Metrics-Token 헤더 둘 다 지원한다', async () => {
        const validate = mock(async () => record('client'))
        const app = createApp({ validate, scope: 'client' })
        const bearer = await app.request('/test', { headers: { Authorization: 'Bearer plain-token' } })
        expect(bearer.status).toBe(200)
        const header = await app.request('/test', { headers: { 'X-Metrics-Token': 'plain-token' } })
        expect(header.status).toBe(200)
        expect(validate.mock.calls[0][0]).toBe('plain-token')
        expect(validate.mock.calls[1][0]).toBe('plain-token')
    })

    test('rate limit 초과 시 429를 반환하고, 미사용 시 검사하지 않는다', async () => {
        const checkRateLimit = mock(async () => false)
        const limited = createApp({ validate: mock(async () => record('client')), checkRateLimit, scope: 'client', checkRateLimitEnabled: true })
        const res = await limited.request('/test', { headers: { Authorization: 'Bearer t' } })
        expect(res.status).toBe(429)

        const unchecked = createApp({ validate: mock(async () => record('client')), checkRateLimit, scope: 'client' })
        const ok = await unchecked.request('/test', { headers: { Authorization: 'Bearer t' } })
        expect(ok.status).toBe(200)
        expect(checkRateLimit).toHaveBeenCalledTimes(1)
    })

    test('통과 시 컨텍스트에 tokenId와 alias를 세팅한다', async () => {
        const app = createApp({ validate: mock(async () => record('client')), scope: 'client' })
        const res = await app.request('/test', { headers: { Authorization: 'Bearer t' } })
        const body = await res.json()
        expect(body.tokenId).toBe(1)
        expect(body.alias).toBe('demo-mbp')
    })
})
