import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { withSpotifyAuth } from '../../lib/with-spotify-auth'
import { withErrorHandling } from '../../lib/with-error-handling'

const mockAccount = {
    id: 1,
    userId: 'user-1',
    spotifyUserId: 'spotify-1',
    displayName: null,
    email: null,
    betterAuthAccountId: 'ba-1',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const createDeps = (overrides: Record<string, unknown> = {}) => ({
    spotifyApiKeyService: {
        validate: mock((token: string) =>
            token === 'valid-key' ? Promise.resolve({ userId: 'user-1', spotifyAccountId: 1 }) : Promise.resolve(null),
        ),
        ...(overrides.spotifyApiKeyService as Record<string, unknown>),
    },
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: null, image: null } })),
    spotifyAccountService: {
        getById: mock((id: number, userId: string) => {
            if (id === 1 && userId === 'user-1') return Promise.resolve(mockAccount)
            const error = { code: 'SPOTIFY_ACCOUNT_NOT_FOUND', message: 'Not found', statusCode: 404 }
            return Promise.reject(error)
        }),
        ...(overrides.spotifyAccountService as Record<string, unknown>),
    },
    ...(overrides.getSession ? { getSession: overrides.getSession } : {}),
})

const createApp = (deps: ReturnType<typeof createDeps>) => {
    const app = new Hono()
    const auth = withSpotifyAuth(deps as never)

    app.get(
        '/test',
        withErrorHandling(
            auth(async (c, authResult) => {
                return c.json({ spotifyAccountId: authResult.spotifyAccountId, userId: authResult.userId })
            }),
        ),
    )

    return app
}

describe('withSpotifyAuth', () => {
    test('X-Spotify-Key 헤더로 인증한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/test', { headers: { 'X-Spotify-Key': 'valid-key' } })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.spotifyAccountId).toBe(1)
        expect(body.userId).toBe('user-1')
    })

    test('세션 + accountId 쿼리로 인증한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/test?accountId=1')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.spotifyAccountId).toBe(1)
    })

    test('둘 다 없으면 401을 반환한다', async () => {
        const deps = createDeps({
            getSession: mock(() => Promise.resolve(null)),
        })
        const app = createApp(deps)
        const res = await app.request('/test')
        expect(res.status).toBe(401)
    })

    test('잘못된 API Key는 401을 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/test', { headers: { 'X-Spotify-Key': 'invalid-key' } })
        expect(res.status).toBe(401)
    })

    test('세션 인증 시 accountId 없으면 400을 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/test')
        expect(res.status).toBe(400)
    })

    test('세션 인증 시 소유권 검증 실패는 404를 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/test?accountId=999')
        expect(res.status).toBe(404)
    })
})
