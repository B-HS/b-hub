import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { requireDeviceKey } from '../../middleware/require-device-key'
import { errorHandler } from '../../middleware/error-handler'

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

const createMockService = (overrides: Record<string, unknown> = {}) => ({
    validate: mock(() => Promise.resolve(keyRecord('AA:BB:CC'))),
    checkRateLimit: mock(() => Promise.resolve(true)),
    create: mock(() => Promise.resolve('token')),
    revoke: mock(() => Promise.resolve()),
    listAll: mock(() => Promise.resolve([])),
    ...overrides,
})

const createApp = (service = createMockService()) => {
    const app = new Hono()
    app.use('*', errorHandler())
    app.use('*', requireDeviceKey({ deviceKeyService: service as never }))
    app.get('/test', (c) => c.json({ deviceId: c.get('deviceKeyDeviceId' as never) as string }))
    return { app, service }
}

describe('requireDeviceKey middleware', () => {
    test('X-Device-Key 헤더가 없으면 401 을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/test')
        expect(res.status).toBe(401)
    })

    test('키가 무효하면 401 을 반환한다', async () => {
        const { app } = createApp(createMockService({ validate: mock(() => Promise.resolve(null)) }))
        const res = await app.request('/test', { headers: { 'X-Device-Key': 'bad' } })
        expect(res.status).toBe(401)
    })

    test('한도를 넘으면 429 를 반환한다', async () => {
        const { app } = createApp(createMockService({ checkRateLimit: mock(() => Promise.resolve(false)) }))
        const res = await app.request('/test', { headers: { 'X-Device-Key': 'valid' } })
        expect(res.status).toBe(429)
    })

    test('키의 deviceId 를 컨텍스트에 담고 그 값으로 한도를 검사한다', async () => {
        const { app, service } = createApp()
        const res = await app.request('/test', { headers: { 'X-Device-Key': 'valid' } })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ deviceId: 'AA:BB:CC' })
        expect(service.checkRateLimit).toHaveBeenCalledWith('AA:BB:CC', 2000)
    })

    test('deviceId 없는 키도 키 id 식별자로 한도를 검사한다', async () => {
        const service = createMockService({ validate: mock(() => Promise.resolve(keyRecord(null))) })
        const { app } = createApp(service)
        const res = await app.request('/test', { headers: { 'X-Device-Key': 'valid' } })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ deviceId: 'key:7' })
        expect(service.checkRateLimit).toHaveBeenCalledWith('key:7', 2000)
    })

    test('deviceId 없는 키도 한도를 넘으면 429 를 반환한다', async () => {
        const service = createMockService({
            validate: mock(() => Promise.resolve(keyRecord(null))),
            checkRateLimit: mock(() => Promise.resolve(false)),
        })
        const { app } = createApp(service)
        const res = await app.request('/test', { headers: { 'X-Device-Key': 'valid' } })
        expect(res.status).toBe(429)
    })
})
