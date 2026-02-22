import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createWeatherKeyRoute } from '../../../route/weather/key'

const mockGetSession = mock(() =>
    Promise.resolve({
        user: {
            id: 'user-1',
            name: 'Test User',
            email: 'test@example.com',
            role: null as string | null,
            image: null as string | null,
        },
    }),
)

const mockAdminGetSession = mock(() =>
    Promise.resolve({
        user: {
            id: 'admin-1',
            name: 'Admin',
            email: 'admin@example.com',
            role: 'admin' as string | null,
            image: null as string | null,
        },
    }),
)

const createMockWeatherApiKeyService = () => ({
    create: mock(() => Promise.resolve('raw-key-abc123')),
    validate: mock(() => Promise.resolve(null)),
    checkRateLimit: mock(() => Promise.resolve(true)),
    logRequest: mock(() => Promise.resolve()),
    revoke: mock(() => Promise.resolve()),
    listByUser: mock(() =>
        Promise.resolve([
            {
                id: 1,
                name: 'my-key',
                dailyLimit: 100,
                todayUsage: 42,
                expiresAt: null as Date | null,
                lastUsedAt: new Date('2025-01-01'),
                createdAt: new Date('2025-01-01'),
            },
        ]),
    ),
    updateDailyLimit: mock(() => Promise.resolve()),
    getById: mock(() => Promise.resolve(null)),
})

const createApp = (getSession = mockGetSession, service = createMockWeatherApiKeyService()) => {
    const app = new Hono()
    app.route(
        '/weather/keys',
        createWeatherKeyRoute({
            weatherApiKeyService: service as never,
            getSession: getSession as never,
        }),
    )
    return { app, service }
}

describe('GET /weather/keys', () => {
    test('키 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/weather/keys')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data).toHaveLength(1)
        expect(body.data[0].name).toBe('my-key')
        expect(body.data[0].todayUsage).toBe(42)
    })

    test('미인증 시 401을 반환한다', async () => {
        const noSession = mock(() => Promise.resolve(null))
        const { app } = createApp(noSession as never)
        const res = await app.request('/weather/keys')
        expect(res.status).toBe(401)
    })
})

describe('POST /weather/keys', () => {
    test('키를 발급한다', async () => {
        const { app, service } = createApp()
        const res = await app.request('/weather/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'my-new-key' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.key).toBe('raw-key-abc123')
        expect(service.create).toHaveBeenCalledWith('user-1', 'my-new-key')
    })
})

describe('DELETE /weather/keys/:id', () => {
    test('키를 삭제한다', async () => {
        const { app, service } = createApp()
        const res = await app.request('/weather/keys/1', { method: 'DELETE' })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(service.revoke).toHaveBeenCalledWith('user-1', 1)
    })
})

describe('PATCH /weather/keys/:id/limit', () => {
    test('admin이 일일 한도를 수정한다', async () => {
        const service = createMockWeatherApiKeyService()
        const { app } = createApp(mockAdminGetSession, service)
        const res = await app.request('/weather/keys/1/limit', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dailyLimit: 500 }),
        })
        expect(res.status).toBe(200)
        expect(service.updateDailyLimit).toHaveBeenCalledWith(1, 500)
    })

    test('일반 사용자는 403을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/weather/keys/1/limit', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dailyLimit: 500 }),
        })
        expect(res.status).toBe(403)
    })
})
