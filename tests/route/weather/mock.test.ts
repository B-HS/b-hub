import { describe, expect, test, mock, afterEach, setSystemTime } from 'bun:test'
import { Hono } from 'hono'
import { createWeatherMockRoute } from '../../../route/weather/mock'
import { createMockKmaApiService } from '../../../service/domain/weather/mock-kma-api'
import { errorHandler } from '../../../middleware/error-handler'

const mockLocationService = {
    getAll: mock(() => []),
    search: mock(() => [
        {
            code: '1100000000',
            level1: '서울특별시',
            level2: '종로구',
            level3: '청운효자동',
            gridX: 60,
            gridY: 127,
            longitude: 126.97,
            latitude: 37.57,
        },
    ]),
    getByGrid: mock(() => null),
    findNearest: mock(() => null),
}

const logRequestMock = mock(() => Promise.resolve())

const mockWeatherApiKeyService = {
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
    logRequest: logRequestMock,
    revoke: mock(() => Promise.resolve()),
    listByUser: mock(() => Promise.resolve([])),
    updateDailyLimit: mock(() => Promise.resolve()),
    getById: mock(() => Promise.resolve(null)),
}

const HEADERS = { 'X-Weather-Key': 'test-key' }

const createApp = () => {
    const app = new Hono()
    app.use('*', errorHandler())
    app.route(
        '/weather/mock',
        createWeatherMockRoute({
            mockKmaApi: createMockKmaApiService(),
            locationService: mockLocationService,
            weatherApiKeyService: mockWeatherApiKeyService as never,
        }),
    )
    return app
}

describe('GET /weather/mock/current', () => {
    test('Mock 현재 날씨를 조회한다', async () => {
        const app = createApp()
        const res = await app.request('/weather/mock/current?nx=60&ny=127', { headers: HEADERS })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(typeof body.data.temperature).toBe('number')
        expect(body.data.gridX).toBe(60)
    })

    test('location으로 Mock 현재 날씨를 조회한다', async () => {
        const app = createApp()
        const res = await app.request('/weather/mock/current?location=서울', { headers: HEADERS })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
    })

    test('키 없이 요청하면 401을 반환한다', async () => {
        const app = createApp()
        const res = await app.request('/weather/mock/current?nx=60&ny=127')
        expect(res.status).toBe(401)
    })
})

describe('GET /weather/mock/ultra-short', () => {
    test('Mock 초단기예보를 조회한다', async () => {
        const app = createApp()
        const res = await app.request('/weather/mock/ultra-short?nx=60&ny=127', { headers: HEADERS })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.forecasts.length).toBe(6)
    })
})

describe('GET /weather/mock/short-term', () => {
    test('Mock 단기예보를 조회한다', async () => {
        const app = createApp()
        const res = await app.request('/weather/mock/short-term?nx=60&ny=127', { headers: HEADERS })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.forecasts.length).toBeGreaterThan(0)
    })
})

describe('GET /weather/mock/version', () => {
    test('Mock 버전 정보를 조회한다', async () => {
        const app = createApp()
        const res = await app.request('/weather/mock/version?ftype=ODAM', { headers: HEADERS })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.filetype).toBe('ODAM')
    })
})

describe('rate limit / log', () => {
    test('logRequest가 호출되지 않는다', async () => {
        logRequestMock.mockClear()
        const app = createApp()
        await app.request('/weather/mock/current?nx=60&ny=127', { headers: HEADERS })
        expect(logRequestMock).not.toHaveBeenCalled()
    })

    test('checkRateLimit이 호출되지 않는다', async () => {
        mockWeatherApiKeyService.checkRateLimit.mockClear()
        const app = createApp()
        await app.request('/weather/mock/current?nx=60&ny=127', { headers: HEADERS })
        expect(mockWeatherApiKeyService.checkRateLimit).not.toHaveBeenCalled()
    })
})

describe('GET /weather/mock/current 의 baseDate/baseTime', () => {
    const originalTimezone = process.env.TZ

    afterEach(() => {
        setSystemTime()
        if (originalTimezone === undefined) delete process.env.TZ
        else process.env.TZ = originalTimezone
    })

    const requestCurrent = async () => {
        const app = createApp()
        const res = await app.request('/weather/mock/current?nx=60&ny=127', { headers: HEADERS })
        return (await res.json()) as { data: { baseDate: string; baseTime: string } }
    }

    test('서버 TZ가 UTC여도 KST 초단기실황 base time을 반환한다', async () => {
        process.env.TZ = 'UTC'
        setSystemTime(new Date('2025-01-01T15:45:00Z'))

        const body = await requestCurrent()
        expect(body.data.baseDate).toBe('20250102')
        expect(body.data.baseTime).toBe('0000')
    })

    test('40분 이전이면 직전 정시로 내린다', async () => {
        process.env.TZ = 'UTC'
        setSystemTime(new Date('2025-01-01T15:30:00Z'))

        const body = await requestCurrent()
        expect(body.data.baseDate).toBe('20250101')
        expect(body.data.baseTime).toBe('2300')
    })

    test('YYYYMMDD 와 HH00 형식을 유지한다', async () => {
        const body = await requestCurrent()
        expect(body.data.baseDate).toMatch(/^\d{8}$/)
        expect(body.data.baseTime).toMatch(/^\d{2}00$/)
    })
})
