import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createSpotifyPlayingRoute } from '../../../route/spotify/playing'
import { createRateLimiter } from '../../../lib/rate-limit'

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
        create: mock(() => Promise.resolve({ token: 'abc123def45678901234567890abcdef' })),
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
    baseUrl: 'https://api.gumyo.net',
})

const createApp = (deps: ReturnType<typeof createDeps>) => {
    const app = new Hono()
    app.route('/spotify/playing', createSpotifyPlayingRoute(deps as never))
    return app
}

const createRateLimitedApp = (maxRequests: number) => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests })
    const app = new Hono()
    app.route(
        '/spotify/playing',
        createSpotifyPlayingRoute({ ...createDeps(), checkLimit: (key, path) => limiter.checkLimit(`${key}:${path}`) } as never),
    )
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

    test('커스텀 테마 query param을 전달한다', async () => {
        const deps = createDeps()
        const app = createApp(deps)
        await app.request('/spotify/playing/abc123def4567890?bg=000000&accent=ff0000&radius=0')
        const call = deps.spotifyWidgetService.generateSvg.mock.calls[0] as [number, { bg: string; accent: string; radius: number }]
        expect(call[1].bg).toBe('000000')
        expect(call[1].accent).toBe('ff0000')
        expect(call[1].radius).toBe(0)
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

describe('GET /spotify/playing/* rate limit', () => {
    const IP_HEADERS = { 'X-Forwarded-For': '203.0.113.7, 10.0.0.1' }

    test('한도 내 요청은 200 과 X-RateLimit 헤더를 반환한다', async () => {
        const app = createRateLimitedApp(2)
        const res = await app.request('/spotify/playing/abc123def4567890', { headers: IP_HEADERS })
        expect(res.status).toBe(200)
        expect(res.headers.get('X-RateLimit-Limit')).toBe('2')
        expect(res.headers.get('X-RateLimit-Remaining')).toBe('1')
    })

    test('한도를 초과하면 429 RATE_LIMIT_EXCEEDED 를 반환한다', async () => {
        const app = createRateLimitedApp(1)
        await app.request('/spotify/playing/abc123def4567890', { headers: IP_HEADERS })
        const res = await app.request('/spotify/playing/abc123def4567890', { headers: IP_HEADERS })
        expect(res.status).toBe(429)
        const body = (await res.json()) as { success: boolean; error: { code: string } }
        expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED')
    })

    test('토큰이 다르면 서로의 한도에 영향을 주지 않는다', async () => {
        const app = createRateLimitedApp(1)
        await app.request('/spotify/playing/abc123def4567890', { headers: IP_HEADERS })
        const res = await app.request('/spotify/playing/zzz999def4567890', { headers: IP_HEADERS })
        expect(res.status).toBe(200)
    })

    test('widget 과 data 경로에도 한도를 적용한다', async () => {
        const app = createRateLimitedApp(1)
        await app.request('/spotify/playing/abc123def4567890/widget', { headers: IP_HEADERS })
        const widgetRes = await app.request('/spotify/playing/abc123def4567890/widget', { headers: IP_HEADERS })
        expect(widgetRes.status).toBe(429)
        const dataRes = await app.request('/spotify/playing/abc123def4567890/data', { headers: IP_HEADERS })
        expect(dataRes.status).toBe(429)
    })

    test('checkLimit 이 없으면 X-RateLimit 헤더가 없다', async () => {
        const app = createApp(createDeps())
        const res = await app.request('/spotify/playing/abc123def4567890')
        expect(res.headers.get('X-RateLimit-Limit')).toBeNull()
    })
})
