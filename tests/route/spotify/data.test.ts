import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createSpotifyDataRoute } from '../../../route/spotify/data'

const sessionUser = { id: 'user-1', name: 'Test', email: 'test@test.com', role: null, image: null }

const mockNowPlaying = { isPlaying: true, track: { name: 'Song', artist: 'Artist' }, lastPlayedAt: null }
const mockPlaylists = { items: [{ id: 'pl-1', name: 'Playlist' }], total: 1, limit: 20, offset: 0 }

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

const createDeps = (withSession = true) => ({
    spotifyDataService: {
        getNowPlaying: mock(() => Promise.resolve(mockNowPlaying)),
        getPlaylists: mock(() => Promise.resolve(mockPlaylists)),
    },
    spotifyApiKeyService: {
        validate: mock((token: string) =>
            token === 'valid-key' ? Promise.resolve({ userId: 'user-1', spotifyAccountId: 1 }) : Promise.resolve(null),
        ),
    },
    spotifyAccountService: {
        getById: mock((id: number, userId: string) => {
            if (id === 1 && userId === 'user-1') return Promise.resolve(mockAccount)
            return Promise.reject({ code: 'SPOTIFY_ACCOUNT_NOT_FOUND', message: 'Not found', statusCode: 404 })
        }),
    },
    getSession: mock(() => (withSession ? Promise.resolve({ user: sessionUser }) : Promise.resolve(null))),
})

const createApp = (deps: ReturnType<typeof createDeps>) => {
    const app = new Hono()
    app.route('/spotify', createSpotifyDataRoute(deps as never))
    return app
}

describe('GET /spotify/now-playing', () => {
    test('X-Spotify-Key로 현재 재생 정보를 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/now-playing', { headers: { 'X-Spotify-Key': 'valid-key' } })
        expect(res.status).toBe(200)
        const body = (await res.json()) as { success: boolean; data: { isPlaying: boolean } }
        expect(body.data.isPlaying).toBe(true)
    })

    test('세션 인증으로 현재 재생 정보를 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/now-playing?accountId=1')
        expect(res.status).toBe(200)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createDeps(false)
        const app = createApp(deps)
        const res = await app.request('/spotify/now-playing')
        expect(res.status).toBe(401)
    })

    test('잘못된 API Key는 401을 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/now-playing', { headers: { 'X-Spotify-Key': 'invalid' } })
        expect(res.status).toBe(401)
    })
})

describe('GET /spotify/playlists', () => {
    test('X-Spotify-Key로 플레이리스트를 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/playlists', { headers: { 'X-Spotify-Key': 'valid-key' } })
        expect(res.status).toBe(200)
        const body = (await res.json()) as { success: boolean; data: { items: unknown[] } }
        expect(body.data.items).toHaveLength(1)
    })

    test('limit, offset 쿼리 파라미터가 적용된다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/playlists?accountId=1&limit=10&offset=5')
        expect(res.status).toBe(200)
        expect(deps.spotifyDataService.getPlaylists).toHaveBeenCalledWith(1, 10, 5)
    })
})
