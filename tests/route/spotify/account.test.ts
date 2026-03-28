import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createSpotifyAccountRoute } from '../../../route/spotify/account'

const mockAccount = {
    id: 1,
    spotifyUserId: 'spotify-1',
    displayName: 'Test',
    email: 'test@email.com',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const createDeps = (
    sessionUser: { id: string; name: string; email: string; role: string | null; image: string | null } | null = {
        id: 'user-1',
        name: 'Test',
        email: 'test@test.com',
        role: null,
        image: null,
    },
) => ({
    spotifyAccountService: {
        list: mock(() => Promise.resolve([mockAccount])),
        getById: mock((id: number, userId: string) => {
            if (id === 1 && userId === 'user-1') return Promise.resolve(mockAccount)
            const error = { code: 'SPOTIFY_ACCOUNT_NOT_FOUND', message: 'Not found', statusCode: 404 }
            return Promise.reject(error)
        }),
        update: mock(() => Promise.resolve()),
        remove: mock(() => Promise.resolve()),
    },
    getSession: mock(() => (sessionUser ? Promise.resolve({ user: sessionUser }) : Promise.resolve(null))),
})

const createApp = (deps: ReturnType<typeof createDeps>) => {
    const app = new Hono()
    app.route('/spotify/accounts', createSpotifyAccountRoute(deps as never))
    return app
}

describe('GET /spotify/accounts', () => {
    test('계정 목록을 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/accounts')
        expect(res.status).toBe(200)
        const body = (await res.json()) as { success: boolean; data: unknown[] }
        expect(body.success).toBe(true)
        expect(body.data).toHaveLength(1)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createDeps(null)
        const app = createApp(deps)
        const res = await app.request('/spotify/accounts')
        expect(res.status).toBe(401)
    })
})

describe('GET /spotify/accounts/:accountId', () => {
    test('계정 상세를 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/accounts/1')
        expect(res.status).toBe(200)
    })

    test('없는 계정은 404를 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/accounts/999')
        expect(res.status).toBe(404)
    })
})

describe('PATCH /spotify/accounts/:accountId', () => {
    test('계정을 수정한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/accounts/1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: 'Updated' }),
        })
        expect(res.status).toBe(200)
    })
})

describe('DELETE /spotify/accounts/:accountId', () => {
    test('계정을 삭제한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/accounts/1', { method: 'DELETE' })
        expect(res.status).toBe(200)
    })
})
