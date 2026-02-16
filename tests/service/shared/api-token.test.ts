import { describe, expect, test, mock } from 'bun:test'
import { createApiTokenService, hashToken } from '../../../service/shared/api-token'

const createMockDb = () => {
    const insertValues = mock(() => Promise.resolve())
    const insertMock = mock(() => ({ values: insertValues }))

    const selectFrom = mock(() => ({
        where: mock(() => ({
            limit: mock(() =>
                Promise.resolve([
                    {
                        id: 1,
                        userId: 'user1',
                        token: hashToken('abc123'),
                        name: null,
                        expiresAt: null,
                        lastUsedAt: null,
                        createdAt: new Date(),
                    },
                ]),
            ),
        })),
    }))
    const selectMock = mock(() => ({ from: selectFrom }))

    const updateSet = mock(() => ({
        where: mock(() => Promise.resolve()),
    }))
    const updateMock = mock(() => ({ set: updateSet }))

    const deleteWhere = mock(() => Promise.resolve())
    const deleteMock = mock(() => ({ where: deleteWhere }))

    return {
        insert: insertMock,
        select: selectMock,
        update: updateMock,
        delete: deleteMock,
    }
}

describe('createApiTokenService', () => {
    test('create가 64자 토큰을 생성한다', async () => {
        const db = createMockDb()
        const service = createApiTokenService({ db: db as never })
        const token = await service.create('user1', 'My Token')
        expect(token).toHaveLength(64)
        expect(typeof token).toBe('string')
    })

    test('create가 토큰을 해싱하여 DB에 저장한다', async () => {
        const insertValues = mock(() => Promise.resolve())
        const insertMock = mock(() => ({ values: insertValues }))
        const db = { ...createMockDb(), insert: insertMock }
        const service = createApiTokenService({ db: db as never })
        const rawToken = await service.create('user1', 'My Token')
        const storedToken = insertValues.mock.calls[0][0].token
        expect(storedToken).not.toBe(rawToken)
        expect(storedToken).toBe(hashToken(rawToken))
    })

    test('validate가 유효한 토큰에 대해 사용자 정보를 반환한다', async () => {
        const db = createMockDb()
        const service = createApiTokenService({ db: db as never })
        const result = await service.validate('abc123')
        expect(result).not.toBeNull()
        expect(result?.id).toBe('user1')
    })

    test('validate 결과에 토큰이 포함되지 않는다', async () => {
        const db = createMockDb()
        const service = createApiTokenService({ db: db as never })
        const result = await service.validate('abc123')
        expect(result).not.toBeNull()
        expect((result as Record<string, unknown>).token).toBeUndefined()
    })

    test('validate가 존재하지 않는 토큰에 대해 null을 반환한다', async () => {
        const selectFrom = mock(() => ({
            where: mock(() => ({
                limit: mock(() => Promise.resolve([])),
            })),
        }))
        const db = {
            ...createMockDb(),
            select: mock(() => ({ from: selectFrom })),
        }
        const service = createApiTokenService({ db: db as never })
        const result = await service.validate('nonexistent')
        expect(result).toBeNull()
    })

    test('validate가 만료된 토큰에 대해 null을 반환한다', async () => {
        const expiredRecord = {
            id: 1,
            userId: 'user1',
            token: hashToken('expired'),
            name: null,
            expiresAt: new Date(Date.now() - 10000),
            lastUsedAt: null,
            createdAt: new Date(),
        }
        const selectFrom = mock(() => ({
            where: mock(() => ({
                limit: mock(() => Promise.resolve([expiredRecord])),
            })),
        }))
        const db = {
            ...createMockDb(),
            select: mock(() => ({ from: selectFrom })),
        }
        const service = createApiTokenService({ db: db as never })
        const result = await service.validate('expired')
        expect(result).toBeNull()
    })

    test('revoke가 토큰을 삭제한다', async () => {
        const db = createMockDb()
        const service = createApiTokenService({ db: db as never })
        await service.revoke('user1', 'token123')
        expect(db.delete).toHaveBeenCalled()
    })

    test('listByUser가 사용자의 토큰 목록을 반환한다', async () => {
        const tokens = [{ id: 1, token: 'abc', userId: 'user1' }]
        const selectFrom = mock(() => ({
            where: mock(() => Promise.resolve(tokens)),
        }))
        const db = {
            ...createMockDb(),
            select: mock(() => ({ from: selectFrom })),
        }
        const service = createApiTokenService({ db: db as never })
        const result = await service.listByUser('user1')
        expect(result).toEqual(tokens)
    })

    test('hashToken이 동일한 입력에 대해 동일한 해시를 반환한다', () => {
        const hash1 = hashToken('test-token')
        const hash2 = hashToken('test-token')
        expect(hash1).toBe(hash2)
        expect(hash1).toHaveLength(64)
    })
})
