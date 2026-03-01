import { describe, expect, test, mock } from 'bun:test'
import { createSpotifyApiKeyService } from '../../../../service/domain/spotify/spotify-api-key'
import { hashToken } from '../../../../lib/token-utils'

const createMockDb = () => ({
    insert: mock(() => Promise.resolve({ id: 1 })),
    findByToken: mock((tokenHash: string) =>
        tokenHash === hashToken('valid-token')
            ? Promise.resolve({ id: 1, userId: 'user-1', spotifyAccountId: 1, expiresAt: null })
            : Promise.resolve(null),
    ),
    updateLastUsedAt: mock(() => Promise.resolve()),
    remove: mock(() => Promise.resolve()),
    listByUser: mock(() =>
        Promise.resolve([
            {
                id: 1,
                spotifyAccountId: 1,
                name: 'My Key',
                expiresAt: null,
                lastUsedAt: null,
                createdAt: new Date(),
            },
        ]),
    ),
})

describe('createSpotifyApiKeyService', () => {
    test('create가 64자 토큰을 생성한다', async () => {
        const db = createMockDb()
        const service = createSpotifyApiKeyService({ db })
        const token = await service.create('user-1', 1, 'Test Key')
        expect(token).toHaveLength(64)
    })

    test('create가 토큰을 해싱하여 DB에 저장한다', async () => {
        const db = createMockDb()
        const service = createSpotifyApiKeyService({ db })
        const token = await service.create('user-1', 1)
        const insertCall = db.insert.mock.calls[0][0] as { token: string }
        expect(insertCall.token).not.toBe(token)
        expect(insertCall.token).toBe(hashToken(token))
    })

    test('validate가 유효한 토큰에 대해 계정 정보를 반환한다', async () => {
        const db = createMockDb()
        const service = createSpotifyApiKeyService({ db })
        const result = await service.validate('valid-token')
        expect(result).toEqual({ userId: 'user-1', spotifyAccountId: 1 })
    })

    test('validate가 만료된 토큰에 대해 null을 반환한다', async () => {
        const db = createMockDb()
        db.findByToken = mock(() =>
            Promise.resolve({ id: 1, userId: 'user-1', spotifyAccountId: 1, expiresAt: new Date('2000-01-01') }),
        )
        const service = createSpotifyApiKeyService({ db })
        const result = await service.validate('any-token')
        expect(result).toBeNull()
    })

    test('validate가 존재하지 않는 토큰에 대해 null을 반환한다', async () => {
        const db = createMockDb()
        const service = createSpotifyApiKeyService({ db })
        const result = await service.validate('nonexistent-token')
        expect(result).toBeNull()
    })

    test('revoke가 키를 삭제한다', async () => {
        const db = createMockDb()
        const service = createSpotifyApiKeyService({ db })
        await service.revoke('user-1', 1)
        expect(db.remove).toHaveBeenCalledWith('user-1', 1)
    })

    test('listByUser가 사용자의 키 목록을 반환한다', async () => {
        const db = createMockDb()
        const service = createSpotifyApiKeyService({ db })
        const result = await service.listByUser('user-1')
        expect(result).toHaveLength(1)
        expect(db.listByUser).toHaveBeenCalledWith('user-1')
    })
})
