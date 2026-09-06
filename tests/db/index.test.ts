import { describe, expect, test, beforeEach, afterAll } from 'bun:test'
import { resetEnvCache } from '../../lib/env'
import { getDb, closeDb } from '../../db/index'

const TEST_DATABASE_URL = 'mysql://test:test@localhost:3306/test'

const originalDatabaseUrl = process.env.DATABASE_URL

const setDatabaseUrl = (url: string | undefined) => {
    if (url) process.env.DATABASE_URL = url
    else delete process.env.DATABASE_URL
    resetEnvCache()
}

const readPoolConfig = () => {
    const session = getDb().session as unknown as { client: { pool: { config: Record<string, unknown> } } }
    return session.client.pool.config
}

afterAll(async () => {
    await closeDb()
    setDatabaseUrl(originalDatabaseUrl)
})

describe('getDb', () => {
    beforeEach(async () => {
        await closeDb()
        setDatabaseUrl(TEST_DATABASE_URL)
    })

    test('DATABASE_URL이 없으면 getEnv 검증 에러를 던진다', () => {
        setDatabaseUrl(undefined)
        expect(() => getDb()).toThrow('Missing or invalid environment variables')
    })

    test('같은 인스턴스를 재사용한다', () => {
        expect(getDb()).toBe(getDb())
    })

    test('closeDb 후에는 새 인스턴스를 만든다', async () => {
        const first = getDb()
        await closeDb()
        expect(getDb()).not.toBe(first)
    })

    test('서버리스용 풀 옵션을 적용한다', () => {
        const config = readPoolConfig()
        expect(config.connectionLimit).toBe(20)
        expect(config.maxIdle).toBe(5)
        expect(config.idleTimeout).toBe(60000)
        expect(config.waitForConnections).toBe(true)
        expect(config.queueLimit).toBe(0)
    })

    test('keepAlive 옵션을 적용한다', () => {
        const connectionConfig = readPoolConfig().connectionConfig as Record<string, unknown>
        expect(connectionConfig.enableKeepAlive).toBe(true)
        expect(connectionConfig.keepAliveInitialDelay).toBe(10000)
    })
})
