import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test'
import Redis from 'ioredis'
import { resetEnvCache } from '../../../lib/env'
import { redisCache } from '../../../service/shared/redis-cache'

const originalRedisGet = Redis.prototype.get
const originalRedisSet = Redis.prototype.set
const originalRedisConnect = Redis.prototype.connect
const originalDatabaseUrl = process.env.DATABASE_URL
const originalRedisUrl = process.env.REDIS_URL

const mockRedisGet = mock(() => Promise.resolve(null))
const mockRedisSet = mock(() => Promise.resolve('OK'))
const mockRedisConnect = mock(() => Promise.resolve())

Redis.prototype.get = mockRedisGet as never
Redis.prototype.set = mockRedisSet as never
Redis.prototype.connect = mockRedisConnect as never

const useRedisUrl = (url: string | undefined) => {
    process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test'
    if (url) process.env.REDIS_URL = url
    else delete process.env.REDIS_URL
    resetEnvCache()
}

afterAll(() => {
    Redis.prototype.get = originalRedisGet
    Redis.prototype.set = originalRedisSet
    Redis.prototype.connect = originalRedisConnect
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalDatabaseUrl
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = originalRedisUrl
    resetEnvCache()
})

describe('redisCache', () => {
    beforeEach(() => {
        mockRedisGet.mockReset()
        mockRedisSet.mockReset()
        mockRedisConnect.mockReset()
        mockRedisGet.mockImplementation(() => Promise.resolve(null))
        mockRedisSet.mockImplementation(() => Promise.resolve('OK'))
        mockRedisConnect.mockImplementation(() => Promise.resolve())
        useRedisUrl('redis://localhost:6379')
    })

    describe('get', () => {
        test('키가 없으면 null을 반환한다', async () => {
            const result = await redisCache.get('nonexistent-key-abc')
            expect(result).toBeNull()
        })

        test('연결이 준비되기 전에는 connect 를 기다린 뒤 조회한다', async () => {
            await redisCache.get('connect-first-key-010')
            expect(mockRedisConnect).toHaveBeenCalledTimes(1)
            expect(mockRedisGet).toHaveBeenCalledTimes(1)
        })

        test('초기 연결이 실패하면 Redis 를 조회하지 않고 null 을 반환한다', async () => {
            mockRedisConnect.mockImplementation(() => Promise.reject(new Error('Connection is closed.')))

            const result = await redisCache.get('connect-fail-key-011')
            expect(result).toBeNull()
            expect(mockRedisGet).not.toHaveBeenCalled()
        })

        test('Redis 실패 시 null을 반환한다', async () => {
            mockRedisGet.mockImplementation(() => Promise.reject(new Error('Connection refused')))

            const result = await redisCache.get('redis-fail-key-xyz')
            expect(result).toBeNull()
        })

        test('Redis에서 JSON을 파싱하여 반환한다', async () => {
            const data = { success: true, data: [1, 2, 3] }
            mockRedisGet.mockImplementation(() => Promise.resolve(JSON.stringify(data) as never))

            const result = await redisCache.get<typeof data>('json-key-unique-123')
            expect(result).toEqual(data)
        })

        test('두 번째 조회는 로컬 캐시에서 처리해 Redis를 다시 호출하지 않는다', async () => {
            const data = { value: 'local-cache' }
            mockRedisGet.mockImplementation(() => Promise.resolve(JSON.stringify(data) as never))

            await redisCache.get('local-cache-key-001')
            expect(mockRedisGet).toHaveBeenCalledTimes(1)

            const second = await redisCache.get<typeof data>('local-cache-key-001')
            expect(second).toEqual(data)
            expect(mockRedisGet).toHaveBeenCalledTimes(1)
        })

        test('REDIS_URL이 없으면 Redis를 호출하지 않고 null을 반환한다', async () => {
            useRedisUrl(undefined)

            const result = await redisCache.get('no-redis-url-key-002')
            expect(result).toBeNull()
            expect(mockRedisGet).not.toHaveBeenCalled()
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

        test('REDIS_URL이 없으면 Redis에 쓰지 않고 로컬 캐시만 채운다', async () => {
            useRedisUrl(undefined)

            await redisCache.set('no-redis-set-key-003', { a: 1 }, 60)
            expect(mockRedisSet).not.toHaveBeenCalled()
            expect(await redisCache.get('no-redis-set-key-003')).toEqual({ a: 1 })
        })
    })
})
