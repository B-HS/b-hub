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
