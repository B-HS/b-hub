import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createLocationRoute } from '../../../route/weather/location'
import { createWeatherApiKeyService } from '../../../service/domain/weather/weather-api-key'

const mockLocations = [
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
    {
        code: '2600000000',
        level1: '부산광역시',
        level2: '해운대구',
        level3: null,
        gridX: 99,
        gridY: 75,
        longitude: 129.16,
        latitude: 35.16,
    },
]

const createMockLocationService = () => ({
    getAll: mock(() => mockLocations),
    search: mock((q: string) => mockLocations.filter((l) => l.level1.includes(q))),
    getByGrid: mock((x: number, y: number) => mockLocations.find((l) => l.gridX === x && l.gridY === y) ?? null),
    findNearest: mock(() => mockLocations[0]),
})

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
    logRequest: mock(() => Promise.resolve()),
    revoke: mock(() => Promise.resolve()),
    listByUser: mock(() => Promise.resolve([])),
    updateDailyLimit: mock(() => Promise.resolve()),
    getById: mock(() => Promise.resolve(null)),
}

const HEADERS = { 'X-Weather-Key': 'test-key' }

const createApp = (locationService = createMockLocationService()) => {
    const app = new Hono()
    app.route(
        '/locations',
        createLocationRoute({
            locationService,
            weatherApiKeyService: mockWeatherApiKeyService as never,
        }),
    )
    return { app, locationService }
}

describe('GET /locations/', () => {
    test('전체 위치 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations', { headers: HEADERS })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data).toHaveLength(2)
    })
})

describe('GET /locations/convert', () => {
    test('lat/lon을 격자로 변환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations/convert?lat=37.57&lon=126.97', { headers: HEADERS })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.gridX).toBeDefined()
        expect(body.data.gridY).toBeDefined()
        expect(body.data.nearestLocation).toBeDefined()
    })

    test('gridX/gridY를 좌표로 변환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations/convert?gridX=60&gridY=127', { headers: HEADERS })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.latitude).toBeDefined()
        expect(body.data.longitude).toBeDefined()
    })

    test('파라미터 없으면 에러를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations/convert', { headers: HEADERS })
        expect(res.status).toBe(400)
    })

    test('잘못된 lat/lon은 에러를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations/convert?lat=abc&lon=def', { headers: HEADERS })
        expect(res.status).toBe(400)
    })

    test('잘못된 gridX/gridY는 에러를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations/convert?gridX=abc&gridY=def', { headers: HEADERS })
        expect(res.status).toBe(400)
    })
})

describe('GET /locations/:keyword', () => {
    test('키워드로 위치를 검색한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations/서울', { headers: HEADERS })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data).toHaveLength(1)
        expect(body.data[0].level1).toBe('서울특별시')
    })

    test('100자 초과 키워드는 400 에러를 반환한다', async () => {
        const { app } = createApp()
        const longKeyword = 'a'.repeat(101)
        const res = await app.request(`/locations/${longKeyword}`, { headers: HEADERS })
        expect(res.status).toBe(400)
    })

    test('결과 없으면 빈 배열을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations/존재하지않는지역', { headers: HEADERS })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data).toHaveLength(0)
    })
})

const createRealKeyServiceDb = () => {
    const record = {
        id: 1,
        userId: 'user-1',
        token: 'hashed',
        name: 'test',
        dailyLimit: 100,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
    }
    const values = mock((_row: Record<string, unknown>) => Promise.resolve())
    const db = {
        select: (columns?: unknown) => ({
            from: () => ({
                where: () => (columns ? Promise.resolve([{ count: 0 }]) : { limit: () => Promise.resolve([record]) }),
            }),
        }),
        update: () => ({ set: () => ({ where: () => ({ catch: () => {} }) }) }),
        insert: () => ({ values }),
    }
    return { db, values }
}

const flushPendingLog = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('GET /locations/:keyword 요청 로그', () => {
    test('경로가 50자를 넘어도 endpoint 를 잘라 항상 기록한다', async () => {
        const { db, values } = createRealKeyServiceDb()
        const app = new Hono()
        app.route(
            '/locations',
            createLocationRoute({
                locationService: createMockLocationService(),
                weatherApiKeyService: createWeatherApiKeyService({ db: db as never }),
            }),
        )

        const keyword = '가'.repeat(100)
        const res = await app.request(`/locations/${keyword}`, { headers: { ...HEADERS, 'x-forwarded-for': '203.0.113.7, 70.41.3.18' } })
        await flushPendingLog()

        expect(res.status).toBe(200)
        const row = values.mock.calls[0][0]
        expect(`/locations/${keyword}`.length).toBeGreaterThan(50)
        expect(row.endpoint).toHaveLength(50)
        expect(row.ip).toBe('203.0.113.7')
    })
})
