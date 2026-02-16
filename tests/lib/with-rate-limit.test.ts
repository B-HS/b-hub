import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { withRateLimit } from '../../lib/with-rate-limit'
import { withErrorHandling } from '../../lib/with-error-handling'

const mockUser = {
    id: 'u1',
    name: 'Test',
    email: 'test@test.com',
    role: 'user',
    image: null,
}

describe('withRateLimit', () => {
    test('허용된 경우 핸들러를 실행하고 헤더를 설정한다', async () => {
        const checkLimit = mock(() => ({
            allowed: true,
            limit: 100,
            remaining: 99,
            resetAt: Date.now() + 60000,
        }))

        const app = new Hono()
        app.get(
            '/test',
            withErrorHandling(async (c) => {
                const handler = withRateLimit({ checkLimit })(async (c) => c.json({ ok: true }))
                return handler(c, mockUser)
            }),
        )

        const res = await app.request('/test')
        expect(res.status).toBe(200)
        expect(res.headers.get('X-RateLimit-Limit')).toBe('100')
        expect(res.headers.get('X-RateLimit-Remaining')).toBe('99')
        expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy()
    })

    test('한도 초과 시 429를 반환한다', async () => {
        const checkLimit = mock(() => ({
            allowed: false,
            limit: 100,
            remaining: 0,
            resetAt: Date.now() + 60000,
        }))

        const app = new Hono()
        app.get(
            '/test',
            withErrorHandling(async (c) => {
                const handler = withRateLimit({ checkLimit })(async (c) => c.json({ ok: true }))
                return handler(c, mockUser)
            }),
        )

        const res = await app.request('/test')
        expect(res.status).toBe(429)
        expect(res.headers.get('X-RateLimit-Remaining')).toBe('0')
    })
})
