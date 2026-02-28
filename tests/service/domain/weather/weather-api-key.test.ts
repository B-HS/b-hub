import { describe, expect, test, mock } from 'bun:test'
import { createWeatherApiKeyService } from '../../../../service/domain/weather/weather-api-key'

const createMockDb = (overrides: { selectResult?: unknown[]; countResult?: number } = {}) => {
    const selectResult = overrides.selectResult ?? []
    const countResult = overrides.countResult ?? 0

    const catchMock = mock(() => {})

    const db = {
        insert: mock(() => ({
            values: mock(() => Promise.resolve()),
        })),
        select: mock((...args: unknown[]) => ({
            from: mock(() => ({
                where: mock(() => {
                    // If select was called with { count } arg, it's a count query
                    if (args.length > 0) {
                        return Promise.resolve([{ count: countResult }])
                    }
                    // Otherwise it's a regular select - needs .limit() or direct resolve
                    return {
                        limit: mock(() => Promise.resolve(selectResult)),
                        // for listByUser which has no .limit()
                        then: (resolve: (v: unknown) => void) => Promise.resolve(selectResult).then(resolve),
                    }
                }),
            })),
        })),
        update: mock(() => ({
            set: mock(() => ({
                where: mock(() => ({ catch: catchMock })),
            })),
        })),
        delete: mock(() => ({
            where: mock(() => Promise.resolve()),
        })),
    }

    return db
}

describe('createWeatherApiKeyService', () => {
    test('create는 64자 hex 토큰을 반환한다', async () => {
        const db = createMockDb()
        const service = createWeatherApiKeyService({ db: db as never })

        const token = await service.create('user-1', 'my-key')
        expect(token).toHaveLength(64)
        expect(/^[0-9a-f]{64}$/.test(token)).toBe(true)
        expect(db.insert).toHaveBeenCalled()
    })

    test('validate는 유효한 토큰이면 레코드를 반환한다', async () => {
        const mockRecord = {
            id: 1,
            userId: 'user-1',
            token: 'hashed',
            name: 'test',
            dailyLimit: 100,
            expiresAt: null,
            lastUsedAt: null,
            createdAt: new Date(),
        }
        const db = createMockDb({ selectResult: [mockRecord] })
        const service = createWeatherApiKeyService({ db: db as never })

        const result = await service.validate('some-token')
        expect(result).not.toBeNull()
        expect(result!.id).toBe(1)
    })

    test('validate는 만료된 토큰이면 null을 반환한다', async () => {
        const mockRecord = {
            id: 1,
            userId: 'user-1',
            token: 'hashed',
            name: 'test',
            dailyLimit: 100,
            expiresAt: new Date(Date.now() - 1000),
            lastUsedAt: null,
            createdAt: new Date(),
        }
        const db = createMockDb({ selectResult: [mockRecord] })
        const service = createWeatherApiKeyService({ db: db as never })

        const result = await service.validate('some-token')
        expect(result).toBeNull()
    })

    test('validate는 존재하지 않는 토큰이면 null을 반환한다', async () => {
        const db = createMockDb({ selectResult: [] })
        const service = createWeatherApiKeyService({ db: db as never })

        const result = await service.validate('nonexistent')
        expect(result).toBeNull()
    })

    test('checkRateLimit는 한도 미만이면 true를 반환한다', async () => {
        const db = createMockDb({ countResult: 5 })
        const service = createWeatherApiKeyService({ db: db as never })

        const result = await service.checkRateLimit(1, 100)
        expect(result).toBe(true)
    })

    test('checkRateLimit는 한도 이상이면 false를 반환한다', async () => {
        const db = createMockDb({ countResult: 100 })
        const service = createWeatherApiKeyService({ db: db as never })

        const result = await service.checkRateLimit(1, 100)
        expect(result).toBe(false)
    })

    test('revoke는 userId와 keyId로 삭제한다', async () => {
        const db = createMockDb()
        const service = createWeatherApiKeyService({ db: db as never })

        await service.revoke('user-1', 1)
        expect(db.delete).toHaveBeenCalled()
    })

    test('logRequest는 에러 발생해도 throw하지 않는다', async () => {
        const db = createMockDb()
        db.insert = mock(() => ({
            values: mock(() => ({ catch: mock((fn: (e: Error) => void) => fn(new Error('db error'))) })),
        }))
        const service = createWeatherApiKeyService({ db: db as never })

        await service.logRequest({
            keyId: 1,
            userId: 'user-1',
            endpoint: '/test',
            statusCode: 200,
        })
        // Should not throw
    })
})
