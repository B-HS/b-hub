import { describe, expect, test, mock } from 'bun:test'
import { createMetricsTokenService } from '../../../../service/domain/metrics/token'
import type { MetricsToken } from '../../../../db/schema'

const FIVE_MINUTES_MS = 5 * 60 * 1000

const sampleToken = (overrides: Partial<MetricsToken> = {}): MetricsToken => ({
    id: 3,
    token: 'hash',
    alias: 'demo-mbp',
    scope: 'client',
    dailyLimit: 20000,
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
})

const createDb = (record: MetricsToken) => ({
    insertToken: mock(async () => ({ id: record.id })),
    findByToken: mock(async () => record as MetricsToken | null),
    touchLastUsed: mock(async (_id: number) => {}),
    revokeById: mock(async () => true),
    listAll: mock(async () => [] as MetricsToken[]),
    countEventsSince: mock(async () => 0),
})

describe('createMetricsTokenService.validate 의 lastUsedAt 갱신 주기', () => {
    test('lastUsedAt이 null이면 touchLastUsed를 호출한다', async () => {
        const record = sampleToken()
        const db = createDb(record)
        const service = createMetricsTokenService({ db: db as never })
        expect(await service.validate('t')).toBe(record)
        expect(db.touchLastUsed).toHaveBeenCalledWith(3)
    })

    test('lastUsedAt이 5분 이내면 touchLastUsed를 생략하고 같은 record를 반환한다', async () => {
        const record = sampleToken({ lastUsedAt: new Date(Date.now() - FIVE_MINUTES_MS + 60_000) })
        const db = createDb(record)
        const service = createMetricsTokenService({ db: db as never })
        expect(await service.validate('t')).toBe(record)
        expect(db.touchLastUsed).not.toHaveBeenCalled()
    })

    test('lastUsedAt이 5분 이상 지났으면 touchLastUsed를 호출한다', async () => {
        const record = sampleToken({ lastUsedAt: new Date(Date.now() - FIVE_MINUTES_MS - 1000) })
        const db = createDb(record)
        const service = createMetricsTokenService({ db: db as never })
        expect(await service.validate('t')).toBe(record)
        expect(db.touchLastUsed).toHaveBeenCalledWith(3)
    })

    test('폐기된 토큰은 lastUsedAt이 오래되었어도 null이고 touchLastUsed를 호출하지 않는다', async () => {
        const record = sampleToken({ revokedAt: new Date(), lastUsedAt: new Date(0) })
        const db = createDb(record)
        const service = createMetricsTokenService({ db: db as never })
        expect(await service.validate('t')).toBeNull()
        expect(db.touchLastUsed).not.toHaveBeenCalled()
    })
})
