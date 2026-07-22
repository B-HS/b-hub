import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createMetricsQueryRoute } from '../../../route/metrics/query'
import { errorHandler } from '../../../middleware/error-handler'

const adminRecord = { id: 2, alias: 'dash', scope: 'admin', dailyLimit: 20000 }

const sampleDevice = {
    deviceId: 'mac-1',
    tokenId: 1,
    tokenAlias: 'demo-mbp',
    hostname: 'mbp.local',
    os: 'macos',
    arch: 'aarch64',
    agentVersion: 'machboard@0.1.0',
    intervalSec: 60,
    firstSeenAt: new Date('2026-07-01T00:00:00Z'),
    lastSeenAt: new Date('2026-07-22T00:00:00Z'),
    online: true,
}

const createMockLogService = (overrides: Record<string, unknown> = {}) => ({
    listDevices: mock(() => Promise.resolve([sampleDevice])),
    getDevice: mock(() => Promise.resolve(sampleDevice)),
    series: mock(() => Promise.resolve([{ t: new Date('2026-07-22T00:00:00Z'), v: 42.5 }])),
    list: mock(() => Promise.resolve({ rows: [], total: 0 })),
    ...overrides,
})

const createApp = (logService = createMockLogService()) => {
    const tokenService = { validate: mock(() => Promise.resolve(adminRecord)), checkRateLimit: mock(() => Promise.resolve(true)) }
    const app = new Hono()
    app.use('*', errorHandler())
    app.route('/metrics', createMetricsQueryRoute({ metricsLogService: logService as never, metricsTokenService: tokenService as never }))
    return { app, logService }
}

const get = (app: Hono, path: string) => app.request(path, { headers: { Authorization: 'Bearer admin-token' } })

describe('metrics query routes', () => {
    test('devices는 날짜를 ISO 문자열로 직렬화해 반환한다', async () => {
        const { app } = createApp()
        const res = await get(app, '/metrics/devices')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data[0].deviceId).toBe('mac-1')
        expect(body.data[0].lastSeenAt).toBe('2026-07-22T00:00:00.000Z')
        expect(body.data[0].online).toBe(true)
    })

    test('series는 디바이스가 없으면 404 METRICS_DEVICE_NOT_FOUND다', async () => {
        const { app } = createApp(createMockLogService({ getDevice: mock(() => Promise.resolve(null)) }))
        const res = await get(app, '/metrics/series?deviceId=ghost&field=cpu.usage')
        expect(res.status).toBe(404)
        const body = await res.json()
        expect(body.error.code).toBe('METRICS_DEVICE_NOT_FOUND')
    })

    test('series는 포인트를 t/v로 반환한다', async () => {
        const { app } = createApp()
        const res = await get(app, '/metrics/series?deviceId=mac-1&field=cpu.usage')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.points).toEqual([{ t: '2026-07-22T00:00:00.000Z', v: 42.5 }])
    })

    test('field에 mongo 연산자 문자가 들어가면 400이다', async () => {
        const { app } = createApp()
        const res = await get(app, '/metrics/series?deviceId=mac-1&field=cpu.$usage')
        expect(res.status).toBe(400)
    })
})
