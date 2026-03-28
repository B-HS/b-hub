import { describe, expect, test, mock, beforeEach } from 'bun:test'

const mockRedisGet = mock(() => Promise.resolve(null))
const mockRedisSet = mock(() => Promise.resolve('OK'))

mock.module('ioredis', () => ({
    default: class MockRedis {
        get = mockRedisGet
        set = mockRedisSet
    },
}))

const { redisCache } = await import('../../../service/shared/redis-cache')

describe('redisCache', () => {
    beforeEach(() => {
        mockRedisGet.mockReset()
        mockRedisSet.mockReset()
        mockRedisGet.mockImplementation(() => Promise.resolve(null))
        mockRedisSet.mockImplementation(() => Promise.resolve('OK'))
    })

    describe('get', () => {
        test('키가 없으면 null을 반환한다', async () => {
            const result = await redisCache.get('nonexistent-key-abc')
            expect(result).toBeNull()
        })

        test('Redis 실패 시 null을 반환한다', async () => {
            mockRedisGet.mockImplementation(() => Promise.reject(new Error('Connection refused')))

            const result = await redisCache.get('redis-fail-key-xyz')
            expect(result).toBeNull()
        })

        test('Redis에서 JSON을 파싱하여 반환한다', async () => {
            const data = { success: true, data: [1, 2, 3] }
            mockRedisGet.mockImplementation(() => Promise.resolve(JSON.stringify(data)))

            const result = await redisCache.get<typeof data>('json-key-unique-123')
            expect(result).toEqual(data)
        })
    })

    describe('set', () => {
        test('Redis에 JSON으로 직렬화하여 저장한다', async () => {
            const data = { message: 'hello' }
            await redisCache.set('set-key-unique-456', data, 60)

            expect(mockRedisSet).toHaveBeenCalled()
        })

        test('Redis 실패해도 에러를 던지지 않는다', async () => {
            mockRedisSet.mockImplementation(() => Promise.reject(new Error('Redis down')))

            await expect(redisCache.set('fail-set-key-789', { data: 'test' }, 60)).resolves.toBeUndefined()
        })
    })
})
