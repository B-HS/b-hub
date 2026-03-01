import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createSpotifyPlayingRoute } from '../../../route/spotify/playing'

const mockTrack = {
    name: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    albumArt: null,
    externalUrl: null,
    durationMs: 200000,
    progressMs: 50000,
}

const createDeps = (isValid = true) => ({
    spotifyWidgetTokenService: {
        validate: mock(() =>
            isValid
                ? Promise.resolve({ userId: 'user-1', spotifyAccountId: 1 })
                : Promise.reject({ code: 'SPOTIFY_WIDGET_TOKEN_NOT_FOUND', message: 'Not found', statusCode: 404 }),
        ),
        create: mock(() => Promise.resolve({ id: 1, token: 'abc123def4567890' })),
        revoke: mock(() => Promise.resolve()),
        listByUser: mock(() => Promise.resolve([])),
        toggleActive: mock(() => Promise.resolve()),
    },
    spotifyWidgetService: {
        generateSvg: mock(() => Promise.resolve('<svg>mock</svg>')),
        generateHtmlWidget: mock(() => '<!DOCTYPE html><html></html>'),
        getNowPlayingData: mock(() =>
            Promise.resolve({
                isPlaying: true,
                track: mockTrack,
                lastPlayedAt: null,
            }),
        ),
    },
    baseUrl: 'https://hub.gumyo.net',
})

const createApp = (deps: ReturnType<typeof createDeps>) => {
    const app = new Hono()
    app.route('/spotify/playing', createSpotifyPlayingRoute(deps as never))
    return app
}

describe('GET /spotify/playing/:token', () => {
    test('SVG 이미지를 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/playing/abc123def4567890')
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toBe('image/svg+xml')
        const body = await res.text()
        expect(body).toContain('<svg')
    })

    test('잘못된 토큰이면 404를 반환한다', async () => {
        const deps = createDeps(false)
        const app = createApp(deps)
        const res = await app.request('/spotify/playing/invalid-token-00')
        expect(res.status).toBe(404)
    })

    test('no-cache 헤더를 포함한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/playing/abc123def4567890')
        expect(res.headers.get('cache-control')).toContain('no-cache')
    })
})

describe('GET /spotify/playing/:token/widget', () => {
    test('HTML 위젯을 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/playing/abc123def4567890/widget')
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toContain('text/html')
    })
})

describe('GET /spotify/playing/:token/data', () => {
    test('JSON 데이터를 반환한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/playing/abc123def4567890/data')
        expect(res.status).toBe(200)
        const body = (await res.json()) as { success: boolean; data: { isPlaying: boolean } }
        expect(body.success).toBe(true)
        expect(body.data.isPlaying).toBe(true)
    })

    test('CORS 헤더를 포함한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        const res = await app.request('/spotify/playing/abc123def4567890/data')
        expect(res.headers.get('access-control-allow-origin')).toBe('*')
    })
})
