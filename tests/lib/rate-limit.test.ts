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

    test('resetAt이 현재시간 + windowMs 근처이다', () => {
        const windowMs = 60000
        const before = Date.now()
        const limiter = createRateLimiter({ windowMs, maxRequests: 5 })
        const result = limiter.checkLimit('user1')
        const after = Date.now()
        expect(result.resetAt).toBeGreaterThanOrEqual(before + windowMs)
        expect(result.resetAt).toBeLessThanOrEqual(after + windowMs)
    })

    test('다른 키는 독립적으로 카운트된다', () => {
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 })
        limiter.checkLimit('a')
        limiter.checkLimit('a')
        expect(limiter.checkLimit('a').allowed).toBe(false)
        const resultB = limiter.checkLimit('b')
        expect(resultB.allowed).toBe(true)
        expect(resultB.remaining).toBe(1)
    })
})

describe('createRateLimiter (공유 스토어)', () => {
    const createFakeStore = () => {
        const counts = new Map<string, number>()
        const calls: { key: string; windowMs: number }[] = []
        return {
            calls,
            increment: async (key: string, windowMs: number) => {
                calls.push({ key, windowMs })
                const count = (counts.get(key) ?? 0) + 1
                counts.set(key, count)
                return { count, resetAt: Date.now() + windowMs }
            },
            reset: async (key: string) => {
                counts.delete(key)
            },
        }
    }

    test('스토어를 주면 스토어 카운트로 판정한다', async () => {
        const store = createFakeStore()
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 }, store)

        const first = await limiter.checkLimit('user1')
        expect(first.allowed).toBe(true)
        expect(first.remaining).toBe(1)

        await limiter.checkLimit('user1')
        const third = await limiter.checkLimit('user1')
        expect(third.allowed).toBe(false)
        expect(third.remaining).toBe(0)
    })

    test('스토어에 키와 windowMs를 그대로 전달한다', async () => {
        const store = createFakeStore()
        const limiter = createRateLimiter({ windowMs: 1234, maxRequests: 5 }, store)
        await limiter.checkLimit('mail:u1:/api/mail')
        expect(store.calls[0]).toEqual({ key: 'mail:u1:/api/mail', windowMs: 1234 })
    })

    test('스토어 reset 후 다시 허용된다', async () => {
        const store = createFakeStore()
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 }, store)
        await limiter.checkLimit('user1')
        expect((await limiter.checkLimit('user1')).allowed).toBe(false)
        await limiter.reset('user1')
        expect((await limiter.checkLimit('user1')).allowed).toBe(true)
    })

    test('스토어가 실패하면 인메모리로 폴백한다', async () => {
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 }, { increment: async () => Promise.reject(new Error('redis down')) })
        const first = await limiter.checkLimit('user1')
        expect(first.allowed).toBe(true)
        expect(first.remaining).toBe(0)
        const second = await limiter.checkLimit('user1')
        expect(second.allowed).toBe(false)
    })

    test('스토어 resetAt을 결과에 그대로 반영한다', async () => {
        const resetAt = Date.now() + 5000
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 3 }, { increment: async () => ({ count: 1, resetAt }) })
        const result = await limiter.checkLimit('user1')
        expect(result.resetAt).toBe(resetAt)
        expect(result.limit).toBe(3)
    })
})
