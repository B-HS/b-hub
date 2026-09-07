import { describe, expect, test, mock } from 'bun:test'
import { createApiTokenService, hashToken } from '../../../service/shared/api-token'

const FIVE_MINUTES_MS = 5 * 60 * 1000

const createDbWithRecord = (lastUsedAt: Date | null) => {
    const updateWhere = mock(() => Promise.resolve())
    const updateSet = mock(() => ({ where: updateWhere }))
    const update = mock(() => ({ set: updateSet }))

    const record = {
        id: 7,
        userId: 'user-7',
        token: hashToken('tok'),
        name: null,
        expiresAt: null,
        lastUsedAt,
        createdAt: new Date(),
    }

    const select = mock(() => ({
        from: mock(() => ({
            where: mock(() => ({
                limit: mock(() => Promise.resolve([record])),
            })),
        })),
    }))

    return {
        db: {
            select,
            update,
            insert: mock(() => ({ values: mock(() => Promise.resolve()) })),
            delete: mock(() => ({ where: mock(() => Promise.resolve()) })),
        },
        update,
        updateSet,
    }
}

describe('createApiTokenService.validate 의 lastUsedAt 갱신 주기', () => {
    test('lastUsedAt이 null이면 UPDATE를 수행한다', async () => {
        const { db, update } = createDbWithRecord(null)
        const service = createApiTokenService({ db: db as never })
        const result = await service.validate('tok')
        expect(result).toEqual({ id: 'user-7' })
        expect(update).toHaveBeenCalledTimes(1)
    })

    test('lastUsedAt이 5분 이내면 UPDATE를 생략한다', async () => {
        const { db, update } = createDbWithRecord(new Date(Date.now() - FIVE_MINUTES_MS + 60_000))
        const service = createApiTokenService({ db: db as never })
        const result = await service.validate('tok')
        expect(result).toEqual({ id: 'user-7' })
        expect(update).not.toHaveBeenCalled()
    })

    test('lastUsedAt이 5분 이상 지났으면 UPDATE를 수행한다', async () => {
        const { db, update, updateSet } = createDbWithRecord(new Date(Date.now() - FIVE_MINUTES_MS - 1000))
        const service = createApiTokenService({ db: db as never })
        const result = await service.validate('tok')
        expect(result).toEqual({ id: 'user-7' })
        expect(update).toHaveBeenCalledTimes(1)
        expect(updateSet.mock.calls[0][0]).toHaveProperty('lastUsedAt')
    })

    test('UPDATE 생략 여부와 무관하게 만료 토큰은 null이고 UPDATE도 없다', async () => {
        const updateWhere = mock(() => Promise.resolve())
        const update = mock(() => ({ set: mock(() => ({ where: updateWhere })) }))
        const expired = {
            id: 9,
            userId: 'user-9',
            token: hashToken('exp'),
            name: null,
            expiresAt: new Date(Date.now() - 1000),
            lastUsedAt: null,
            createdAt: new Date(),
        }
        const db = {
            select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ limit: mock(() => Promise.resolve([expired])) })) })) })),
            update,
            insert: mock(() => ({ values: mock(() => Promise.resolve()) })),
            delete: mock(() => ({ where: mock(() => Promise.resolve()) })),
        }
        const service = createApiTokenService({ db: db as never })
        expect(await service.validate('exp')).toBeNull()
        expect(update).not.toHaveBeenCalled()
    })
})
