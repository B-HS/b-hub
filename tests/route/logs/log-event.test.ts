import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createLogEventRoute } from '../../../route/logs/log-event'
import { errorHandler } from '../../../middleware/error-handler'
import type { LogEventIngest } from '../../../dto/logs/log-event'

const keyRecord = (deviceId: string | null) => ({
    id: 7,
    token: 'hashed',
    deviceId,
    label: null,
    dailyLimit: 2000,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date(),
})

type CreateMocksOptions = {
    key?: ReturnType<typeof keyRecord> | null
    checkRateLimit?: (deviceId: string, dailyLimit: number) => Promise<boolean>
}

const createMocks = (options: CreateMocksOptions = {}) => {
    const ingest = mock((_input: LogEventIngest, _meta: Record<string, unknown>) => Promise.resolve({ id: 1 }))
    const ingestBatch = mock((events: LogEventIngest[], _meta: Record<string, unknown>) => Promise.resolve(events.length))
    const checkRateLimit = mock(options.checkRateLimit ?? (() => Promise.resolve(true)))
    const key = options.key === undefined ? keyRecord('AA:BB:CC') : options.key
    const validate = mock(() => Promise.resolve(key))

    const app = new Hono()
    app.use('*', errorHandler())
    app.route(
        '/logs',
        createLogEventRoute({
            logEventService: { ingest, ingestBatch } as never,
            deviceKeyService: { validate, checkRateLimit } as never,
            getSession: (() => Promise.resolve(null)) as never,
        }),
    )

    return { app, ingest, ingestBatch, checkRateLimit }
}

const HEADERS = { 'X-Device-Key': 'valid', 'Content-Type': 'application/json' }

const event = (deviceId?: string) => ({ service: 'esp32-weather', errorCode: 'ESP_WIFI_DOWN', severity: 40, ...(deviceId ? { deviceId } : {}) })

const post = (app: Hono, path: string, body: unknown) => app.request(path, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })

describe('POST /logs', () => {
    test('본문 deviceId 를 키의 deviceId 로 덮어써 저장한다', async () => {
        const { app, ingest } = createMocks()
        const res = await post(app, '/logs', event('SPOOFED'))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ success: true, data: { id: 1 } })
        expect(ingest.mock.calls[0][0].deviceId).toBe('AA:BB:CC')
    })

    test('deviceId 없는 키는 키 id 식별자로 저장한다', async () => {
        const { app, ingest } = createMocks({ key: keyRecord(null) })
        const res = await post(app, '/logs', event('SPOOFED'))

        expect(res.status).toBe(200)
        expect(ingest.mock.calls[0][0].deviceId).toBe('key:7')
    })

    test('한도를 넘으면 429 를 반환한다', async () => {
        const { app } = createMocks({ checkRateLimit: () => Promise.resolve(false) })
        const res = await post(app, '/logs', event())

        expect(res.status).toBe(429)
    })
})

describe('POST /logs/batch', () => {
    test('모든 이벤트의 deviceId 를 키의 deviceId 로 덮어써 저장한다', async () => {
        const { app, ingestBatch } = createMocks()
        const res = await post(app, '/logs/batch', { events: [event('SPOOFED'), event()] })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ success: true, data: { count: 2 } })
        expect(ingestBatch.mock.calls[0][0].map((e) => e.deviceId)).toEqual(['AA:BB:CC', 'AA:BB:CC'])
    })

    test('미들웨어 한도 검사를 통과하면 배치 건수와 무관하게 저장한다', async () => {
        const { app, checkRateLimit, ingestBatch } = createMocks()
        const res = await post(app, '/logs/batch', { events: [event(), event()] })

        expect(res.status).toBe(200)
        expect(checkRateLimit).toHaveBeenCalledTimes(1)
        expect(checkRateLimit).toHaveBeenLastCalledWith('AA:BB:CC', 2000)
        expect(ingestBatch).toHaveBeenCalledTimes(1)
    })

    test('미들웨어 한도 검사에 걸리면 429 를 반환한다', async () => {
        const { app, ingestBatch } = createMocks({ checkRateLimit: () => Promise.resolve(false) })
        const res = await post(app, '/logs/batch', { events: [event(), event()] })

        expect(res.status).toBe(429)
        expect(ingestBatch).not.toHaveBeenCalled()
    })

    test('50건을 넘으면 미들웨어 한도 검사 뒤 413 을 반환한다', async () => {
        const { app, checkRateLimit } = createMocks()
        const res = await post(app, '/logs/batch', { events: Array.from({ length: 51 }, () => event()) })

        expect(res.status).toBe(413)
        expect(checkRateLimit).toHaveBeenCalledTimes(1)
    })

    test('키가 무효하면 배치 크기 검사보다 먼저 401 을 반환한다', async () => {
        const { app } = createMocks({ key: null })
        const res = await post(app, '/logs/batch', { events: Array.from({ length: 51 }, () => event()) })

        expect(res.status).toBe(401)
    })
})

describe('로그 수집 본문 크기 제한', () => {
    test('1MB 를 넘는 본문은 413 LOG_BATCH_TOO_LARGE 다', async () => {
        const { app, ingest } = createMocks()
        const huge = { ...event(), errorDescription: 'x'.repeat(1024 * 1024 + 1024) }
        const res = await post(app, '/logs', huge)

        expect(res.status).toBe(413)
        expect((await res.json()).error.code).toBe('LOG_BATCH_TOO_LARGE')
        expect(ingest).not.toHaveBeenCalled()
    })

    test('크기 제한보다 디바이스 키 검사가 먼저다', async () => {
        const { app } = createMocks({ key: null })
        const huge = { ...event(), errorDescription: 'x'.repeat(1024 * 1024 + 1024) }
        const res = await post(app, '/logs', huge)

        expect(res.status).toBe(401)
    })

    test('제한 이하 본문은 정상 수집한다', async () => {
        const { app, ingest } = createMocks()
        const res = await post(app, '/logs', { ...event(), errorDescription: 'x'.repeat(1000) })

        expect(res.status).toBe(200)
        expect(ingest).toHaveBeenCalledTimes(1)
    })
})
