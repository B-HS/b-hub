import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createRouter } from '../../route/index'
import { resetEnvCache } from '../../lib/env'
import { errorHandler } from '../../middleware/error-handler'
import { createMockKmaApiService } from '../../service/domain/weather/mock-kma-api'

const MOCK_CURRENT_PATH = '/api/weather/mock/current?nx=60&ny=127'
const WEATHER_KEY_HEADERS = { 'X-Weather-Key': 'test-key' }

const weatherApiKeyServiceStub = {
    create: mock(() => Promise.resolve('test-token')),
    validate: mock(() =>
        Promise.resolve({
            id: 1,
            userId: 'user-1',
            token: 'hashed',
            name: 'test',
            dailyLimit: 100,
            expiresAt: null,
            lastUsedAt: null,
            createdAt: new Date(),
        }),
    ),
    checkRateLimit: mock(() => Promise.resolve(true)),
    logRequest: mock(() => Promise.resolve()),
    revoke: mock(() => Promise.resolve()),
    listByUser: mock(() => Promise.resolve([])),
    updateDailyLimit: mock(() => Promise.resolve()),
    getById: mock(() => Promise.resolve(null)),
}

const buildApiApp = (deps: Parameters<typeof createRouter>[0] = {}) => {
    const app = new Hono()
    app.use('*', errorHandler())
    const { api } = createRouter(deps)
    app.route('/api', api)
    return app
}

const buildWeatherApp = (isProduction: boolean) =>
    buildApiApp({
        isProduction,
        mockKmaApi: createMockKmaApiService(),
        weatherApiKeyService: weatherApiKeyServiceStub as never,
    })

describe('createRouter weather mock 마운트 게이트', () => {
    test('production 이 아닌 환경에서는 mock 라우트를 마운트한다 (키 없으면 401)', async () => {
        resetEnvCache()
        const res = await buildApiApp().request(MOCK_CURRENT_PATH)
        expect(res.status).toBe(401)
    })

    test('isProduction false 를 주입하면 mock 라우트를 마운트한다', async () => {
        const res = await buildWeatherApp(false).request(MOCK_CURRENT_PATH, { headers: WEATHER_KEY_HEADERS })
        expect(res.status).toBe(200)
    })

    test('isProduction true 를 주입하면 mock 라우트를 마운트하지 않는다 (404)', async () => {
        const res = await buildWeatherApp(true).request(MOCK_CURRENT_PATH, { headers: WEATHER_KEY_HEADERS })
        expect(res.status).toBe(404)
    })
})

describe('createRouter 공개 경로 rate limit 배선', () => {
    const PUBLIC_RATE_LIMIT_MAX_REQUESTS = 60
    const IP_HEADERS = { 'X-Forwarded-For': '203.0.113.11' }

    const badgeServiceStub = {
        generate: mock(() => Promise.resolve({ buffer: Buffer.from('png-data'), cacheHit: false })),
        getAvailableFonts: mock(() => ({ local: [], googleFontsSupported: false })),
        generateCacheKey: mock(() => 'key'),
    }

    test('badge 이미지 응답에 X-RateLimit 헤더가 붙는다', async () => {
        const app = buildApiApp({ badgeService: badgeServiceStub as never })
        const res = await app.request('/api/badge/image', { headers: IP_HEADERS })
        expect(res.status).toBe(200)
        expect(res.headers.get('X-RateLimit-Limit')).toBe(String(PUBLIC_RATE_LIMIT_MAX_REQUESTS))
        expect(res.headers.get('X-RateLimit-Remaining')).toBe(String(PUBLIC_RATE_LIMIT_MAX_REQUESTS - 1))
    })

    test('badge 이미지가 분당 한도를 넘으면 429 를 반환한다', async () => {
        const app = buildApiApp({ badgeService: badgeServiceStub as never })
        for (let i = 0; i < PUBLIC_RATE_LIMIT_MAX_REQUESTS; i++) {
            await app.request('/api/badge/image', { headers: IP_HEADERS })
        }
        const res = await app.request('/api/badge/image', { headers: IP_HEADERS })
        expect(res.status).toBe(429)
        const body = (await res.json()) as { error: { code: string } }
        expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED')
    })

    test('spotify playing 응답에 X-RateLimit 헤더가 붙는다', async () => {
        const app = buildApiApp({
            spotifyWidgetTokenService: { validate: mock(() => Promise.resolve({ userId: 'user-1', spotifyAccountId: 1 })) } as never,
            spotifyWidgetService: { generateSvg: mock(() => Promise.resolve('<svg></svg>')) } as never,
        })
        const res = await app.request('/api/spotify/playing/abc123def4567890', { headers: IP_HEADERS })
        expect(res.status).toBe(200)
        expect(res.headers.get('X-RateLimit-Limit')).toBe(String(PUBLIC_RATE_LIMIT_MAX_REQUESTS))
    })
})
