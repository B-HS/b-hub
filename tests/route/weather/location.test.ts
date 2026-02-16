import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createLocationRoute } from '../../../route/weather/location'

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

const createApp = (locationService = createMockLocationService()) => {
    const app = new Hono()
    app.route('/locations', createLocationRoute({ locationService }))
    return { app, locationService }
}

describe('GET /locations/', () => {
    test('전체 위치 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data).toHaveLength(2)
    })
})

describe('GET /locations/convert', () => {
    test('lat/lon을 격자로 변환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations/convert?lat=37.57&lon=126.97')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.gridX).toBeDefined()
        expect(body.data.gridY).toBeDefined()
        expect(body.data.nearestLocation).toBeDefined()
    })

    test('gridX/gridY를 좌표로 변환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations/convert?gridX=60&gridY=127')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.latitude).toBeDefined()
        expect(body.data.longitude).toBeDefined()
    })

    test('파라미터 없으면 에러를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations/convert')
        expect(res.status).toBe(400)
    })

    test('잘못된 lat/lon은 에러를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations/convert?lat=abc&lon=def')
        expect(res.status).toBe(400)
    })

    test('잘못된 gridX/gridY는 에러를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations/convert?gridX=abc&gridY=def')
        expect(res.status).toBe(400)
    })
})

describe('GET /locations/:keyword', () => {
    test('키워드로 위치를 검색한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations/서울')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data).toHaveLength(1)
        expect(body.data[0].level1).toBe('서울특별시')
    })

    test('결과 없으면 빈 배열을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/locations/존재하지않는지역')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data).toHaveLength(0)
    })
})
