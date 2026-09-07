import { describe, expect, test, mock } from 'bun:test'
import { createAppError } from '../../../../lib/error'
import { createWeatherApiKeyService } from '../../../../service/domain/weather/weather-api-key'

const createMockDb = (overrides: { selectResult?: unknown[]; countResult?: number } = {}) => {
    const selectResult = overrides.selectResult ?? []
    const countResult = overrides.countResult ?? 0

    const catchMock = mock(() => {})

    const db = {
        insert: mock(() => ({
            values: mock(() => Promise.resolve()),
        })),
        select: mock(() => ({
            from: mock(() => ({
                where: mock(() => ({
                    limit: mock(() => Promise.resolve(selectResult)),
                    then: (resolve: (v: unknown) => void) => Promise.resolve([{ count: countResult }]).then(resolve),
                })),
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
    })
})

const createLogCaptureDb = () => {
    const values = mock((_row: Record<string, unknown>) => Promise.resolve())
    return { db: { insert: mock(() => ({ values })) }, values }
}

const logRequestWith = async (data: { endpoint?: string; ip?: string; userAgent?: string }) => {
    const { db, values } = createLogCaptureDb()
    const service = createWeatherApiKeyService({ db: db as never })

    await service.logRequest({
        keyId: 1,
        userId: 'user-1',
        endpoint: data.endpoint ?? '/test',
        statusCode: 200,
        ip: data.ip,
        userAgent: data.userAgent,
    })

    return values.mock.calls[0][0]
}

describe('createWeatherApiKeyService.logRequest 컬럼 길이 보정', () => {
    test('endpoint 는 50자로 잘라 저장한다', async () => {
        const row = await logRequestWith({ endpoint: `/weather/locations/${'가'.repeat(100)}` })
        expect(row.endpoint).toHaveLength(50)
        expect(row.endpoint).toBe(`/weather/locations/${'가'.repeat(100)}`.slice(0, 50))
    })

    test('ip 는 x-forwarded-for 의 첫 IP 만 저장한다', async () => {
        const row = await logRequestWith({ ip: '203.0.113.7, 70.41.3.18, 150.172.238.178' })
        expect(row.ip).toBe('203.0.113.7')
    })

    test('ip 는 45자를 넘지 않는다', async () => {
        const row = await logRequestWith({ ip: 'a'.repeat(80) })
        expect(row.ip).toHaveLength(45)
    })

    test('빈 ip 문자열은 null 로 저장한다', async () => {
        const row = await logRequestWith({ ip: '  ' })
        expect(row.ip).toBeNull()
    })

    test('userAgent 는 512자로 잘라 저장한다', async () => {
        const row = await logRequestWith({ userAgent: 'u'.repeat(2000) })
        expect(row.userAgent).toHaveLength(512)
    })

    test('짧은 값은 그대로 저장한다', async () => {
        const row = await logRequestWith({ endpoint: '/weather/current', ip: '203.0.113.7', userAgent: 'esp32-weather/1.0' })
        expect(row.endpoint).toBe('/weather/current')
        expect(row.ip).toBe('203.0.113.7')
        expect(row.userAgent).toBe('esp32-weather/1.0')
    })
})

const createValidateDb = (onUpdate: () => Promise<void>) => ({
    select: () => ({
        from: () => ({
            where: () => ({
                limit: () =>
                    Promise.resolve([
                        {
                            id: 1,
                            userId: 'user-1',
                            token: 'hashed',
                            name: 'test',
                            dailyLimit: 100,
                            expiresAt: null,
                            lastUsedAt: null,
                            createdAt: new Date(),
                        },
                    ]),
            }),
        }),
    }),
    update: () => ({ set: () => ({ where: () => onUpdate() }) }),
})

describe('createWeatherApiKeyService.validate 사용시각 갱신', () => {
    test('lastUsedAt 갱신을 반환 전에 await 한다', async () => {
        let touched = false
        const service = createWeatherApiKeyService({
            db: createValidateDb(async () => {
                await new Promise((resolve) => setTimeout(resolve, 20))
                touched = true
            }) as never,
        })

        const record = await service.validate('some-token')
        expect(record?.id).toBe(1)
        expect(touched).toBe(true)
    })

    test('lastUsedAt 갱신이 실패해도 키 검증은 성공한다', async () => {
        const service = createWeatherApiKeyService({
            db: createValidateDb(async () => {
                throw createAppError('INTERNAL_ERROR')
            }) as never,
        })

        const record = await service.validate('some-token')
        expect(record?.id).toBe(1)
    })
})
