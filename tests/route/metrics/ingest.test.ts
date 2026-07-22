import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createMetricsIngestRoute } from '../../../route/metrics/ingest'
import { errorHandler } from '../../../middleware/error-handler'

const tokenRecord = { id: 1, alias: 'demo-mbp', scope: 'client', dailyLimit: 20000 }

const createMockTokenService = (overrides: Record<string, unknown> = {}) => ({
    validate: mock(() => Promise.resolve(tokenRecord)),
    checkRateLimit: mock(() => Promise.resolve(true)),
    ...overrides,
})

const createMockLogService = () => ({
    ingest: mock((_token: { id: number; alias: string }, events: unknown[]) => Promise.resolve(events.length)),
})

const createApp = (tokenService = createMockTokenService(), logService = createMockLogService()) => {
    const app = new Hono()
    app.use('*', errorHandler())
    app.route('/metrics/ingest', createMetricsIngestRoute({ metricsTokenService: tokenService as never, metricsLogService: logService as never }))
    return { app, tokenService, logService }
}

const postJson = (app: Hono, path: string, body: unknown, token = 'valid-token') =>
    app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
    })

describe('POST /metrics/ingest', () => {
    test('유효 토큰 단건 수집은 200과 count를 반환하고 토큰 정보를 넘긴다', async () => {
        const { app, logService } = createApp()
        const res = await postJson(app, '/metrics/ingest', { deviceId: 'mac-1', payload: { cpu: { usage: 1 } } })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.count).toBe(1)
        const [token, events] = logService.ingest.mock.calls[0]
        expect(token).toEqual({ id: 1, alias: 'demo-mbp' })
        expect((events as { deviceId: string }[])[0].deviceId).toBe('mac-1')
    })

    test('토큰 헤더가 없으면 401이다', async () => {
        const { app } = createApp()
        const res = await app.request('/metrics/ingest', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ deviceId: 'x', payload: {} }),
        })
        expect(res.status).toBe(401)
    })

    test('rate limit 초과 시 429다', async () => {
        const { app } = createApp(createMockTokenService({ checkRateLimit: mock(() => Promise.resolve(false)) }))
        const res = await postJson(app, '/metrics/ingest', { deviceId: 'x', payload: {} })
        expect(res.status).toBe(429)
    })

    test('payload 직렬화 64KB 초과는 413 METRICS_PAYLOAD_TOO_LARGE다', async () => {
        const { app, logService } = createApp()
        const res = await postJson(app, '/metrics/ingest', { deviceId: 'x', payload: { blob: 'a'.repeat(70000) } })
        expect(res.status).toBe(413)
        const body = await res.json()
        expect(body.error.code).toBe('METRICS_PAYLOAD_TOO_LARGE')
        expect(logService.ingest).not.toHaveBeenCalled()
    })
})

describe('POST /metrics/ingest/batch', () => {
    test('50건 이하 배치는 200과 count를 반환한다', async () => {
        const { app } = createApp()
        const events = Array.from({ length: 50 }, (_, i) => ({ deviceId: `d-${i}`, payload: {} }))
        const res = await postJson(app, '/metrics/ingest/batch', { events })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.count).toBe(50)
    })

    test('50건 초과는 413 METRICS_BATCH_TOO_LARGE다', async () => {
        const { app, logService } = createApp()
        const events = Array.from({ length: 51 }, (_, i) => ({ deviceId: `d-${i}`, payload: {} }))
        const res = await postJson(app, '/metrics/ingest/batch', { events })
        expect(res.status).toBe(413)
        const body = await res.json()
        expect(body.error.code).toBe('METRICS_BATCH_TOO_LARGE')
        expect(logService.ingest).not.toHaveBeenCalled()
    })

    test('빈 배열은 400이다', async () => {
        const { app } = createApp()
        const res = await postJson(app, '/metrics/ingest/batch', { events: [] })
        expect(res.status).toBe(400)
    })
})
