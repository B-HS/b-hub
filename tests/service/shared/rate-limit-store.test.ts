import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test'
import Redis from 'ioredis'
import { createRedisRateLimitStore } from '../../../service/shared/rate-limit-store'

const originalEval = Redis.prototype.eval
const originalDel = Redis.prototype.del
const originalConnect = Redis.prototype.connect

const callOrder: string[] = []
const mockEval = mock(() => {
    callOrder.push('eval')
    return Promise.resolve([1, 60000] as never)
})
const mockDel = mock(() => Promise.resolve(1 as never))
const mockConnect = mock(() => {
    callOrder.push('connect')
    return Promise.resolve()
})

Redis.prototype.eval = mockEval as never
Redis.prototype.del = mockDel as never
Redis.prototype.connect = mockConnect as never

afterAll(() => {
    Redis.prototype.eval = originalEval
    Redis.prototype.del = originalDel
    Redis.prototype.connect = originalConnect
})

describe('createRedisRateLimitStore', () => {
    beforeEach(() => {
        callOrder.length = 0
        mockEval.mockReset()
        mockDel.mockReset()
        mockConnect.mockReset()
        mockEval.mockImplementation(() => {
            callOrder.push('eval')
            return Promise.resolve([1, 60000] as never)
        })
        mockDel.mockImplementation(() => Promise.resolve(1 as never))
        mockConnect.mockImplementation(() => {
            callOrder.push('connect')
            return Promise.resolve()
        })
    })

    test('연결이 준비되지 않았으면 connect 를 먼저 기다린 뒤 명령을 보낸다', async () => {
        const store = createRedisRateLimitStore({ url: 'redis://localhost:6379' })
        await store.increment('k', 60000)

        expect(callOrder).toEqual(['connect', 'eval'])
    })

    test('초기 연결이 실패하면 명령을 보내지 않고 에러를 전파한다', async () => {
        mockConnect.mockImplementation(() => Promise.reject(new Error('Connection is closed.')))
        const store = createRedisRateLimitStore({ url: 'redis://localhost:6379' })

        await expect(store.increment('k', 60000)).rejects.toThrow('Connection is closed.')
        expect(mockEval).not.toHaveBeenCalled()
    })

    test('increment는 Lua 스크립트를 키 1개와 windowMs로 호출한다', async () => {
        const store = createRedisRateLimitStore({ url: 'redis://localhost:6379' })
        await store.increment('mail:u1:/api/mail', 60000)

        const args = mockEval.mock.calls[0] as unknown as [string, number, string, string]
        expect(args[1]).toBe(1)
        expect(args[2]).toBe('mail:u1:/api/mail')
        expect(args[3]).toBe('60000')
        expect(args[0]).toContain('INCR')
        expect(args[0]).toContain('PEXPIRE')
    })

    test('count와 PTTL 기반 resetAt을 반환한다', async () => {
        mockEval.mockImplementation(() => Promise.resolve([3, 12000] as never))
        const store = createRedisRateLimitStore({ url: 'redis://localhost:6379' })
        const before = Date.now()
        const result = await store.increment('k', 60000)
        const after = Date.now()

        expect(result.count).toBe(3)
        expect(result.resetAt).toBeGreaterThanOrEqual(before + 12000)
        expect(result.resetAt).toBeLessThanOrEqual(after + 12000)
    })

    test('PTTL이 음수면 windowMs를 대신 사용한다', async () => {
        mockEval.mockImplementation(() => Promise.resolve([1, -1] as never))
        const store = createRedisRateLimitStore({ url: 'redis://localhost:6379' })
        const before = Date.now()
        const result = await store.increment('k', 60000)

        expect(result.resetAt).toBeGreaterThanOrEqual(before + 60000)
    })

    test('응답 형식이 예상과 다르면 에러를 던진다', async () => {
        mockEval.mockImplementation(() => Promise.resolve('unexpected' as never))
        const store = createRedisRateLimitStore({ url: 'redis://localhost:6379' })

        await expect(store.increment('k', 60000)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
    })

    test('Redis 실패는 그대로 전파된다', async () => {
        mockEval.mockImplementation(() => Promise.reject(new Error('Connection refused')))
        const store = createRedisRateLimitStore({ url: 'redis://localhost:6379' })

        await expect(store.increment('k', 60000)).rejects.toThrow('Connection refused')
    })

    test('reset은 키를 삭제한다', async () => {
        const store = createRedisRateLimitStore({ url: 'redis://localhost:6379' })
        await store.reset('k')

        expect(mockDel).toHaveBeenCalledWith('k')
    })
})
