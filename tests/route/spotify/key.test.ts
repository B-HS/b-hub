import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createSpotifyKeyRoute } from '../../../route/spotify/key'

const sessionUser = { id: 'user-1', name: 'Test', email: 'test@test.com', role: null, image: null }

const createDeps = (withSession = true) => ({
    spotifyApiKeyService: {
        listByUser: mock(() =>
            Promise.resolve([
                { id: 1, spotifyAccountId: 1, name: 'Key', expiresAt: null, lastUsedAt: null, createdAt: new Date() },
            ]),
        ),
        create: mock(() => Promise.resolve('generated-token-64chars'.padEnd(64, '0'))),
        revoke: mock(() => Promise.resolve()),
    },
    spotifyAccountService: {
        getById: mock(() => Promise.resolve({ id: 1 })),
    },
    getSession: mock(() => (withSession ? Promise.resolve({ user: sessionUser }) : Promise.resolve(null))),
})

const createApp = (deps: ReturnType<typeof createDeps>) => {
    const app = new Hono()
    app.route('/spotify/keys', createSpotifyKeyRoute(deps as never))
    return app
}

describe('GET /spotify/keys', () => {
    test('키 목록을 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/keys')
        expect(res.status).toBe(200)
        const body = (await res.json()) as { success: boolean; data: unknown[] }
        expect(body.data).toHaveLength(1)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createDeps(false)
        const app = createApp(deps)
        const res = await app.request('/spotify/keys')
        expect(res.status).toBe(401)
    })
})

describe('POST /spotify/keys', () => {
    test('키를 생성하고 원본을 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spotifyAccountId: 1, name: 'New Key' }),
        })
        expect(res.status).toBe(200)
        const body = (await res.json()) as { success: boolean; data: { key: string } }
        expect(body.data.key).toBeTruthy()
    })

    test('잘못된 요청은 400을 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        })
        expect(res.status).toBe(400)
    })
})

describe('DELETE /spotify/keys/:id', () => {
    test('키를 삭제한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/keys/1', { method: 'DELETE' })
        expect(res.status).toBe(200)
    })
})
