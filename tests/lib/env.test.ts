import { describe, expect, test, beforeEach } from 'bun:test'
import { getEnv, resetEnvCache } from '../../lib/env'

describe('getEnv', () => {
    beforeEach(() => {
        resetEnvCache()
    })

    test('필수 환경변수가 없으면 에러를 던진다', () => {
        const original = process.env.DATABASE_URL
        delete process.env.DATABASE_URL
        resetEnvCache()
        expect(() => getEnv()).toThrow('Missing or invalid environment variables')
        process.env.DATABASE_URL = original
    })

    test('DATABASE_URL이 있으면 성공한다', () => {
        const original = process.env.DATABASE_URL
        process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test'
        resetEnvCache()
        const env = getEnv()
        expect(env.DATABASE_URL).toBe('mysql://test:test@localhost:3306/test')
        process.env.DATABASE_URL = original
    })

    test('NODE_ENV 기본값은 development이다', () => {
        const originalDB = process.env.DATABASE_URL
        const originalNode = process.env.NODE_ENV
        process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test'
        delete process.env.NODE_ENV
        resetEnvCache()
        const env = getEnv()
        expect(env.NODE_ENV).toBe('development')
        process.env.DATABASE_URL = originalDB
        process.env.NODE_ENV = originalNode
    })

    test('캐시된 결과를 반환한다', () => {
        const original = process.env.DATABASE_URL
        process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test'
        resetEnvCache()
        const env1 = getEnv()
        const env2 = getEnv()
        expect(env1).toBe(env2)
        process.env.DATABASE_URL = original
    })
})
