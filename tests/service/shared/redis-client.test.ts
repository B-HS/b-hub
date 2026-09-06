import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import Redis from 'ioredis'
import { getRedisClient } from '../../../service/shared/redis-client'

const originalConnect = Redis.prototype.connect

const mockConnect = mock(() => Promise.resolve())
Redis.prototype.connect = mockConnect as never

afterAll(() => {
    Redis.prototype.connect = originalConnect
})

let urlSeq = 0
const uniqueUrl = () => `redis://redis-client-test-${++urlSeq}:6379`

describe('getRedisClient', () => {
    beforeEach(() => {
        mockConnect.mockReset()
        mockConnect.mockImplementation(() => Promise.resolve())
    })

    test('같은 URL 이면 같은 클라이언트를 재사용한다', () => {
        const url = uniqueUrl()
        expect(getRedisClient(url)).toBe(getRedisClient(url))
    })

    test('URL 이 바뀌면 새 클라이언트를 만든다', () => {
        const first = getRedisClient(uniqueUrl())
        const second = getRedisClient(uniqueUrl())
        expect(second).not.toBe(first)
    })

    test('클라이언트는 lazyConnect 로 만들어져 생성만으로는 연결하지 않는다', () => {
        const client = getRedisClient(uniqueUrl())
        expect(client.redis.status).toBe('wait')
        expect(mockConnect).not.toHaveBeenCalled()
    })

    test('wait 상태면 connect 를 호출하고 완료를 기다린다', async () => {
        const client = getRedisClient(uniqueUrl())
        await client.ensureConnected()
        expect(mockConnect).toHaveBeenCalledTimes(1)
    })

    test('ready 상태면 connect 를 호출하지 않는다', async () => {
        const client = getRedisClient(uniqueUrl())
        client.redis.status = 'ready'
        await client.ensureConnected()
        expect(mockConnect).not.toHaveBeenCalled()
    })

    test('첫 연결 중 동시 호출은 같은 연결 완료를 기다리고 connect 는 1회만 부른다', async () => {
        let finishConnect = () => {}
        mockConnect.mockImplementation(() => new Promise<void>((resolve) => (finishConnect = resolve)))
        const client = getRedisClient(uniqueUrl())

        const first = client.ensureConnected()
        client.redis.status = 'connecting'
        const second = client.ensureConnected()
        finishConnect()
        await Promise.all([first, second])

        expect(mockConnect).toHaveBeenCalledTimes(1)
    })

    test('초기 연결이 실패하면 재연결 중인 동안의 호출도 즉시 거부된다', async () => {
        mockConnect.mockImplementation(() => Promise.reject(new Error('Connection is closed.')))
        const client = getRedisClient(uniqueUrl())

        await expect(client.ensureConnected()).rejects.toThrow('Connection is closed.')
        client.redis.status = 'reconnecting'
        await expect(client.ensureConnected()).rejects.toThrow('Connection is closed.')
        expect(mockConnect).toHaveBeenCalledTimes(1)
    })

    test('재연결이 끝나 ready 가 되면 다시 통과한다', async () => {
        mockConnect.mockImplementation(() => Promise.reject(new Error('Connection is closed.')))
        const client = getRedisClient(uniqueUrl())

        await expect(client.ensureConnected()).rejects.toThrow()
        client.redis.status = 'ready'
        await expect(client.ensureConnected()).resolves.toBeUndefined()
    })
})
