import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createBadgeRoute } from '../../route/badge'
import { createAppError } from '../../lib/error'
import { createRateLimiter } from '../../lib/rate-limit'

const createMockBadgeService = () => ({
    generate: mock(() => Promise.resolve({ buffer: Buffer.from('png-data'), cacheHit: false })),
    getAvailableFonts: mock(() => ({
        local: [{ name: 'Inter', weights: [400, 700] }],
        googleFontsSupported: true,
    })),
    generateCacheKey: mock(() => 'abc123'),
})

const createApp = (badgeService = createMockBadgeService()) => {
    const app = new Hono()
    app.route('/badge', createBadgeRoute({ badgeService }))
    return { app, badgeService }
}

const createRateLimitedApp = (maxRequests: number) => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests })
    const app = new Hono()
    app.route('/badge', createBadgeRoute({ badgeService: createMockBadgeService(), checkLimit: (key, path) => limiter.checkLimit(`${key}:${path}`) }))
    return app
}

describe('GET /badge/image', () => {
    test('기본 파라미터로 PNG 이미지를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/badge/image')
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toBe('image/png')
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    })

    test('캐시 미스면 X-Cache: MISS를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/badge/image')
        expect(res.headers.get('X-Cache')).toBe('MISS')
    })

    test('캐시 히트면 X-Cache: HIT를 반환한다', async () => {
        const badgeService = createMockBadgeService()
        badgeService.generate = mock(() => Promise.resolve({ buffer: Buffer.from('cached'), cacheHit: true }))
        const { app } = createApp(badgeService)
        const res = await app.request('/badge/image')
        expect(res.headers.get('X-Cache')).toBe('HIT')
    })

    test('쿼리 파라미터가 서비스에 전달된다', async () => {
        const { app, badgeService } = createApp()
        const res = await app.request('/badge/image?text=Hello&width=400&height=100&color=%23ff0000')
        expect(res.status).toBe(200)
        const callArgs = (badgeService.generate as ReturnType<typeof mock>).mock.calls[0][0]
        expect(callArgs.text).toBe('Hello')
        expect(callArgs.width).toBe(400)
        expect(callArgs.height).toBe(100)
        expect(callArgs.color).toBe('#ff0000')
    })

    test('css 쿼리를 JSON으로 파싱한다', async () => {
        const { app, badgeService } = createApp()
        const css = JSON.stringify({ borderRadius: '8px' })
        const res = await app.request(`/badge/image?css=${encodeURIComponent(css)}`)
        expect(res.status).toBe(200)
        const callArgs = (badgeService.generate as ReturnType<typeof mock>).mock.calls[0][0]
        expect(callArgs.css).toEqual({ borderRadius: '8px' })
    })

    test('잘못된 css JSON은 빈 객체로 처리한다', async () => {
        const { app, badgeService } = createApp()
        const res = await app.request('/badge/image?css=invalid-json')
        expect(res.status).toBe(200)
        const callArgs = (badgeService.generate as ReturnType<typeof mock>).mock.calls[0][0]
        expect(callArgs.css).toEqual({})
    })

    test('width 범위를 벗어나면 검증 실패한다', async () => {
        const { app } = createApp()
        const res = await app.request('/badge/image?width=0')
        expect(res.status).not.toBe(200)
    })

    test('width * height 가 2,000,000 을 넘으면 400 을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/badge/image?width=4096&height=4096')
        expect(res.status).toBe(400)
    })

    test('height 범위를 벗어나면 검증 실패한다', async () => {
        const { app } = createApp()
        const res = await app.request('/badge/image?height=5000')
        expect(res.status).not.toBe(200)
    })

    test('서비스 에러 시 에러 응답을 반환한다', async () => {
        const badgeService = createMockBadgeService()
        badgeService.generate = mock(() => Promise.reject(new Error('Generation failed')))
        const { app } = createApp(badgeService)
        const res = await app.request('/badge/image')
        expect(res.status).toBe(500)
    })

    test('IMAGE_GENERATE_FAILED는 코드가 담긴 500 봉투로 응답한다', async () => {
        const badgeService = createMockBadgeService()
        badgeService.generate = mock(() => Promise.reject(createAppError('IMAGE_GENERATE_FAILED'))) as never
        const { app } = createApp(badgeService)
        const res = await app.request('/badge/image')
        expect(res.status).toBe(500)
        const body = (await res.json()) as { success: boolean; error: { code: string } }
        expect(body.success).toBe(false)
        expect(body.error.code).toBe('IMAGE_GENERATE_FAILED')
    })
})

describe('GET /badge/image rate limit', () => {
    const IP_HEADERS = { 'X-Forwarded-For': '203.0.113.7, 10.0.0.1' }

    test('한도 내 요청은 200 과 X-RateLimit 헤더를 반환한다', async () => {
        const app = createRateLimitedApp(2)
        const res = await app.request('/badge/image', { headers: IP_HEADERS })
        expect(res.status).toBe(200)
        expect(res.headers.get('X-RateLimit-Limit')).toBe('2')
        expect(res.headers.get('X-RateLimit-Remaining')).toBe('1')
        expect(res.headers.get('X-RateLimit-Reset')).not.toBeNull()
    })

    test('한도를 초과하면 429 RATE_LIMIT_EXCEEDED 를 반환한다', async () => {
        const app = createRateLimitedApp(1)
        await app.request('/badge/image', { headers: IP_HEADERS })
        const res = await app.request('/badge/image', { headers: IP_HEADERS })
        expect(res.status).toBe(429)
        expect(res.headers.get('X-RateLimit-Remaining')).toBe('0')
        const body = (await res.json()) as { success: boolean; error: { code: string } }
        expect(body.success).toBe(false)
        expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED')
    })

    test('IP 가 다르면 서로의 한도에 영향을 주지 않는다', async () => {
        const app = createRateLimitedApp(1)
        await app.request('/badge/image', { headers: IP_HEADERS })
        const res = await app.request('/badge/image', { headers: { 'X-Real-IP': '198.51.100.9' } })
        expect(res.status).toBe(200)
    })

    test('checkLimit 이 없으면 X-RateLimit 헤더가 없다', async () => {
        const { app } = createApp()
        const res = await app.request('/badge/image')
        expect(res.status).toBe(200)
        expect(res.headers.get('X-RateLimit-Limit')).toBeNull()
    })
})

describe('GET /badge/fonts', () => {
    test('폰트 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/badge/fonts')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.local).toHaveLength(1)
        expect(body.local[0].name).toBe('Inter')
        expect(body.googleFontsSupported).toBe(true)
    })
})
