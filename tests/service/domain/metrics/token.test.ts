import { describe, expect, test, mock } from 'bun:test'
import { createMetricsTokenService } from '../../../../service/domain/metrics/token'
import type { MetricsToken } from '../../../../db/schema'

const sampleToken = (overrides: Partial<MetricsToken> = {}): MetricsToken => ({
    id: 1,
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

const createMockDb = (overrides: Record<string, unknown> = {}) => ({
    insertToken: mock(async (_row: { token: string }) => ({ id: 1 })),
    findByToken: mock(async (_hash: string) => null as MetricsToken | null),
    touchLastUsed: mock(async (_id: number) => {}),
    revokeById: mock(async (_id: number) => true),
    listAll: mock(async () => [] as MetricsToken[]),
    countEventsSince: mock(async (_tokenId: number, _since: Date) => 0),
    ...overrides,
})

describe('createMetricsTokenService', () => {
    test('create는 평문이 아닌 sha256 해시를 저장하고 평문을 1회 반환한다', async () => {
        const db = createMockDb()
        const service = createMetricsTokenService({ db: db as never })
        const { id, token } = await service.create({ alias: 'demo-mbp', scope: 'client' })
        expect(id).toBe(1)
        expect(token).toMatch(/^[0-9a-f]{64}$/)
        const row = db.insertToken.mock.calls[0][0]
        expect(row.token).toMatch(/^[0-9a-f]{64}$/)
        expect(row.token).not.toBe(token)
    })

    test('create는 expiresInDays로 만료일을 계산하고 미지정 시 null이다', async () => {
        const db = createMockDb()
        const service = createMetricsTokenService({ db: db as never })
        await service.create({ alias: 'a', scope: 'client', expiresInDays: 7 })
        const withExpiry = db.insertToken.mock.calls[0][0] as { expiresAt: Date | null }
        const expectedMs = Date.now() + 7 * 24 * 60 * 60 * 1000
        expect(Math.abs((withExpiry.expiresAt?.getTime() ?? 0) - expectedMs)).toBeLessThan(5000)

        await service.create({ alias: 'b', scope: 'admin' })
        const withoutExpiry = db.insertToken.mock.calls[1][0] as { expiresAt: Date | null }
        expect(withoutExpiry.expiresAt).toBeNull()
    })

    test('validate는 미존재/폐기/만료 토큰에 null을 반환한다', async () => {
        const notFound = createMetricsTokenService({ db: createMockDb() as never })
        expect(await notFound.validate('t')).toBeNull()

        const revoked = createMetricsTokenService({
            db: createMockDb({ findByToken: mock(async () => sampleToken({ revokedAt: new Date() })) }) as never,
        })
        expect(await revoked.validate('t')).toBeNull()

        const expired = createMetricsTokenService({
            db: createMockDb({ findByToken: mock(async () => sampleToken({ expiresAt: new Date(Date.now() - 1000) })) }) as never,
        })
        expect(await expired.validate('t')).toBeNull()
    })

    test('validate는 유효 토큰의 record를 반환하고 lastUsedAt을 갱신한다', async () => {
        const db = createMockDb({ findByToken: mock(async () => sampleToken()) })
        const service = createMetricsTokenService({ db: db as never })
        const record = await service.validate('t')
        expect(record?.id).toBe(1)
        expect(db.touchLastUsed).toHaveBeenCalledWith(1)
    })

    test('checkRateLimit는 24h 카운트가 한도 이상이면 false다', async () => {
        const under = createMetricsTokenService({ db: createMockDb({ countEventsSince: mock(async () => 19999) }) as never })
        expect(await under.checkRateLimit(1, 20000)).toBe(true)

        const over = createMetricsTokenService({ db: createMockDb({ countEventsSince: mock(async () => 20000) }) as never })
        expect(await over.checkRateLimit(1, 20000)).toBe(false)
    })
})
