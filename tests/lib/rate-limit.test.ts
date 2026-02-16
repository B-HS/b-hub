import { describe, expect, test } from 'bun:test'
import { createRateLimiter } from '../../lib/rate-limit'

describe('createRateLimiter', () => {
    test('첫 요청은 허용된다', () => {
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 5 })
        const result = limiter.checkLimit('user1')
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(4)
        expect(result.limit).toBe(5)
    })

    test('한도 내 요청은 허용된다', () => {
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 3 })
        limiter.checkLimit('user1')
        limiter.checkLimit('user1')
        const result = limiter.checkLimit('user1')
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(0)
    })

    test('한도 초과 시 거부된다', () => {
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 })
        limiter.checkLimit('user1')
        limiter.checkLimit('user1')
        const result = limiter.checkLimit('user1')
        expect(result.allowed).toBe(false)
        expect(result.remaining).toBe(0)
    })

    test('다른 키는 독립적으로 카운팅된다', () => {
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 })
        limiter.checkLimit('user1')
        const result = limiter.checkLimit('user2')
        expect(result.allowed).toBe(true)
    })

    test('리셋 후 다시 허용된다', () => {
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 })
        limiter.checkLimit('user1')
        expect(limiter.checkLimit('user1').allowed).toBe(false)
        limiter.reset('user1')
        expect(limiter.checkLimit('user1').allowed).toBe(true)
    })

    test('윈도우 만료 후 리셋된다', async () => {
        const limiter = createRateLimiter({ windowMs: 50, maxRequests: 1 })
        limiter.checkLimit('user1')
        expect(limiter.checkLimit('user1').allowed).toBe(false)
        await new Promise((resolve) => setTimeout(resolve, 60))
        expect(limiter.checkLimit('user1').allowed).toBe(true)
    })
})
