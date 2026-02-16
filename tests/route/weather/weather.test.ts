import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createWeatherRoute } from '../../../route/weather/weather'

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

const createMockKmaApi = () => ({
    getUltraSrtNcst: mock(() =>
        Promise.resolve({
            success: true as const,
            data: [
                {
                    baseDate: '20250101',
                    baseTime: '1200',
                    category: 'T1H',
                    obsrValue: '5',
                    nx: 60,
                    ny: 127,
                },
                {
                    baseDate: '20250101',
                    baseTime: '1200',
                    category: 'REH',
                    obsrValue: '65',
                    nx: 60,
                    ny: 127,
                },
                {
                    baseDate: '20250101',
                    baseTime: '1200',
                    category: 'PTY',
                    obsrValue: '0',
                    nx: 60,
                    ny: 127,
                },
                {
                    baseDate: '20250101',
                    baseTime: '1200',
                    category: 'VEC',
                    obsrValue: '180',
                    nx: 60,
                    ny: 127,
                },
                {
                    baseDate: '20250101',
                    baseTime: '1200',
                    category: 'WSD',
                    obsrValue: '3.5',
                    nx: 60,
                    ny: 127,
                },
                {
                    baseDate: '20250101',
                    baseTime: '1200',
                    category: 'RN1',
                    obsrValue: '0',
                    nx: 60,
                    ny: 127,
                },
                {
                    baseDate: '20250101',
                    baseTime: '1200',
                    category: 'UUU',
                    obsrValue: '1.2',
                    nx: 60,
                    ny: 127,
                },
                {
                    baseDate: '20250101',
                    baseTime: '1200',
                    category: 'VVV',
                    obsrValue: '-2.3',
                    nx: 60,
                    ny: 127,
                },
            ],
        }),
    ),
    getUltraSrtFcst: mock(() =>
        Promise.resolve({
            success: true as const,
            data: [
                {
                    baseDate: '20250101',
                    baseTime: '1200',
                    category: 'T1H',
                    fcstDate: '20250101',
                    fcstTime: '1300',
                    fcstValue: '6',
                    nx: 60,
                    ny: 127,
                },
                {
                    baseDate: '20250101',
                    baseTime: '1200',
                    category: 'SKY',
                    fcstDate: '20250101',
                    fcstTime: '1300',
                    fcstValue: '1',
                    nx: 60,
                    ny: 127,
                },
            ],
        }),
    ),
    getVilageFcst: mock(() =>
        Promise.resolve({
            success: true as const,
            data: [
                {
                    baseDate: '20250101',
                    baseTime: '0500',
                    category: 'TMP',
                    fcstDate: '20250101',
                    fcstTime: '0600',
                    fcstValue: '3',
                    nx: 60,
                    ny: 127,
                },
                {
                    baseDate: '20250101',
                    baseTime: '0500',
                    category: 'SKY',
                    fcstDate: '20250101',
                    fcstTime: '0600',
                    fcstValue: '1',
                    nx: 60,
                    ny: 127,
                },
            ],
        }),
    ),
    getFcstVersion: mock(() =>
        Promise.resolve({
            success: true as const,
            data: { filetype: 'ODAM', version: '20250101120000' },
        }),
    ),
})

const createApp = (kmaApi = createMockKmaApi()) => {
    const app = new Hono()
    app.route('/weather', createWeatherRoute({ kmaApi, locationService: mockLocationService }))
    return { app, kmaApi }
}

describe('GET /weather/current', () => {
    test('nx/ny로 현재 날씨를 조회한다', async () => {
        const { app } = createApp()
        const res = await app.request('/weather/current?nx=60&ny=127')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.temperature).toBe(5)
        expect(body.data.gridX).toBe(60)
    })

    test('location으로 현재 날씨를 조회한다', async () => {
        const { app } = createApp()
        const res = await app.request('/weather/current?location=서울')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
    })

    test('좌표 없으면 에러를 반환한다', async () => {
        const kmaApi = createMockKmaApi()
        const noResultLocationService = {
            ...mockLocationService,
            search: mock(() => []),
        }
        const app = new Hono()
        app.route('/weather', createWeatherRoute({ kmaApi, locationService: noResultLocationService }))
        const res = await app.request('/weather/current')
        expect(res.status).toBe(400)
    })

    test('KMA API 실패 시 에러를 반환한다', async () => {
        const kmaApi = createMockKmaApi()
        kmaApi.getUltraSrtNcst = mock(() =>
            Promise.resolve({
                success: false as const,
                error: { code: 'WEATHER_KMA_API_ERROR', message: 'Failed' },
            }),
        )
        const { app } = createApp(kmaApi)
        const res = await app.request('/weather/current?nx=60&ny=127')
        expect(res.status).toBe(502)
    })
})

describe('GET /weather/ultra-short', () => {
    test('초단기예보를 조회한다', async () => {
        const { app } = createApp()
        const res = await app.request('/weather/ultra-short?nx=60&ny=127')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.forecasts).toHaveLength(1)
    })
})

describe('GET /weather/short-term', () => {
    test('단기예보를 조회한다', async () => {
        const { app } = createApp()
        const res = await app.request('/weather/short-term?nx=60&ny=127')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.forecasts).toHaveLength(1)
    })
})

describe('GET /weather/version', () => {
    test('예보 버전을 조회한다', async () => {
        const { app } = createApp()
        const res = await app.request('/weather/version?ftype=ODAM')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.filetype).toBe('ODAM')
    })

    test('잘못된 ftype은 에러를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/weather/version?ftype=INVALID')
        expect(res.status).not.toBe(200)
    })

    test('ftype이 없으면 에러를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/weather/version')
        expect(res.status).not.toBe(200)
    })
})
