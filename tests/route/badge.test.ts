import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createBadgeRoute } from '../../route/badge'
import { createAppError } from '../../lib/error'

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
