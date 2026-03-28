import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createSpotifyWidgetTokenRoute } from '../../../route/spotify/widget-token'

const sessionUser = { id: 'user-1', name: 'Test', email: 'test@test.com', role: null, image: null }

const createDeps = (withSession = true) => ({
    spotifyWidgetTokenService: {
        listByUser: mock(() => Promise.resolve([{ id: 1, spotifyAccountId: 1, name: 'Widget', isActive: true, createdAt: new Date() }])),
        create: mock(() => Promise.resolve({ token: 'abc123def45678901234567890abcdef' })),
        revoke: mock(() => Promise.resolve()),
        toggleActive: mock(() => Promise.resolve()),
        validate: mock(() => Promise.resolve({ userId: 'user-1', spotifyAccountId: 1 })),
    },
    spotifyAccountService: {
        getById: mock(() => Promise.resolve({ id: 1 })),
    },
    getSession: mock(() => (withSession ? Promise.resolve({ user: sessionUser }) : Promise.resolve(null))),
})

const createApp = (deps: ReturnType<typeof createDeps>) => {
    const app = new Hono()
    app.route('/spotify/widget-tokens', createSpotifyWidgetTokenRoute(deps as never))
    return app
}

describe('GET /spotify/widget-tokens', () => {
    test('토큰 목록을 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/widget-tokens')
        expect(res.status).toBe(200)
        const body = (await res.json()) as { success: boolean; data: unknown[] }
        expect(body.data).toHaveLength(1)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createDeps(false)
        const app = createApp(deps)
        const res = await app.request('/spotify/widget-tokens')
        expect(res.status).toBe(401)
    })
})

describe('POST /spotify/widget-tokens', () => {
    test('토큰을 생성한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/widget-tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spotifyAccountId: 1, name: 'New Widget' }),
        })
        expect(res.status).toBe(200)
        const body = (await res.json()) as { success: boolean; data: { token: string } }
        expect(body.data.token).toBeTruthy()
    })
})

describe('DELETE /spotify/widget-tokens/:id', () => {
    test('토큰을 삭제한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/widget-tokens/1', { method: 'DELETE' })
        expect(res.status).toBe(200)
    })
})

describe('PATCH /spotify/widget-tokens/:id/active', () => {
    test('토큰 활성 상태를 변경한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/widget-tokens/1/active', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: false }),
        })
        expect(res.status).toBe(200)
        const body = (await res.json()) as { success: boolean; data: { isActive: boolean } }
        expect(body.data.isActive).toBe(false)
    })
})
