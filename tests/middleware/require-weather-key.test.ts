import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { requireWeatherKey } from '../../middleware/require-weather-key'
import { errorHandler } from '../../middleware/error-handler'

const mockKeyRecord = {
    id: 1,
    userId: 'user-1',
    token: 'hashed',
    name: 'test-key',
    dailyLimit: 100,
    expiresAt: null,
    lastUsedAt: null,
    createdAt: new Date(),
}

const createMockService = (overrides: Record<string, unknown> = {}) => ({
    validate: mock(() => Promise.resolve(mockKeyRecord)),
    checkRateLimit: mock(() => Promise.resolve(true)),
    logRequest: mock(() => Promise.resolve()),
    create: mock(() => Promise.resolve('token')),
    revoke: mock(() => Promise.resolve()),
    listByUser: mock(() => Promise.resolve([])),
    updateDailyLimit: mock(() => Promise.resolve()),
    getById: mock(() => Promise.resolve(null)),
    ...overrides,
})

const createApp = (service = createMockService()) => {
    const app = new Hono()
    app.use('*', errorHandler())
    app.use('*', requireWeatherKey({ weatherApiKeyService: service as never }))
    app.get('/test', (c) => c.json({ ok: true }))
    return { app, service }
}

describe('requireWeatherKey middleware', () => {
    test('X-Weather-Key 헤더 누락 시 401을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/test')
        expect(res.status).toBe(401)
    })

    test('키가 무효하면 401을 반환한다', async () => {
        const { app } = createApp(createMockService({ validate: mock(() => Promise.resolve(null)) }))
        const res = await app.request('/test', { headers: { 'X-Weather-Key': 'bad-key' } })
        expect(res.status).toBe(401)
    })

    test('rate limit 초과 시 429를 반환한다', async () => {
        const { app } = createApp(createMockService({ checkRateLimit: mock(() => Promise.resolve(false)) }))
        const res = await app.request('/test', { headers: { 'X-Weather-Key': 'valid-key' } })
        expect(res.status).toBe(429)
    })

    test('정상 키이면 통과하고 logRequest를 호출한다', async () => {
        const { app, service } = createApp()
        const res = await app.request('/test', { headers: { 'X-Weather-Key': 'valid-key' } })
        expect(res.status).toBe(200)
        expect(service.logRequest).toHaveBeenCalled()
    })

    test('요청 로그 기록을 응답 반환 전에 await 한다', async () => {
        let logged = false
        const logRequest = mock(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20))
            logged = true
        })
        const { app } = createApp(createMockService({ logRequest }))

        await app.request('/test', { headers: { 'X-Weather-Key': 'valid-key' } })
        expect(logged).toBe(true)
    })
})
