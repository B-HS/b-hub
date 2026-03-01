import { describe, expect, test, mock } from 'bun:test'
import { createSpotifyWidgetTokenService } from '../../../../service/domain/spotify/spotify-widget-token'

const createMockDb = () => ({
    insert: mock(() => Promise.resolve({ id: 1 })),
    findByToken: mock((token: string) =>
        token === 'valid-token-hex00'
            ? Promise.resolve({ id: 1, userId: 'user-1', spotifyAccountId: 1, isActive: true })
            : Promise.resolve(null),
    ),
    remove: mock(() => Promise.resolve()),
    listByUser: mock(() =>
        Promise.resolve([
            {
                id: 1,
                spotifyAccountId: 1,
                token: 'abc123def4567890',
                name: 'My Widget',
                isActive: true,
                createdAt: new Date(),
            },
        ]),
    ),
    updateIsActive: mock(() => Promise.resolve()),
})

describe('createSpotifyWidgetTokenService', () => {
    test('create가 16자 토큰을 생성한다', async () => {
        const db = createMockDb()
        const service = createSpotifyWidgetTokenService({ db })
        const result = await service.create('user-1', 1, 'Widget')
        expect(result.id).toBe(1)
        expect(result.token).toHaveLength(16)
    })

    test('create가 평문 토큰을 DB에 저장한다', async () => {
        const db = createMockDb()
        const service = createSpotifyWidgetTokenService({ db })
        const result = await service.create('user-1', 1)
        const insertCall = db.insert.mock.calls[0][0] as { token: string }
        expect(insertCall.token).toBe(result.token)
    })

    test('validate가 유효한 토큰에 대해 계정 정보를 반환한다', async () => {
        const db = createMockDb()
        const service = createSpotifyWidgetTokenService({ db })
        const result = await service.validate('valid-token-hex00')
        expect(result).toEqual({ userId: 'user-1', spotifyAccountId: 1 })
    })

    test('validate가 존재하지 않는 토큰에 대해 에러를 던진다', async () => {
        const db = createMockDb()
        const service = createSpotifyWidgetTokenService({ db })
        await expect(service.validate('nonexistent')).rejects.toMatchObject({ code: 'SPOTIFY_WIDGET_TOKEN_NOT_FOUND' })
    })

    test('validate가 비활성 토큰에 대해 에러를 던진다', async () => {
        const db = createMockDb()
        db.findByToken = mock(() => Promise.resolve({ id: 1, userId: 'user-1', spotifyAccountId: 1, isActive: false }))
        const service = createSpotifyWidgetTokenService({ db })
        await expect(service.validate('any-token')).rejects.toMatchObject({ code: 'SPOTIFY_WIDGET_TOKEN_INACTIVE' })
    })

    test('revoke가 토큰을 삭제한다', async () => {
        const db = createMockDb()
        const service = createSpotifyWidgetTokenService({ db })
        await service.revoke('user-1', 1)
        expect(db.remove).toHaveBeenCalledWith('user-1', 1)
    })

    test('listByUser가 사용자의 토큰 목록을 반환한다', async () => {
        const db = createMockDb()
        const service = createSpotifyWidgetTokenService({ db })
        const result = await service.listByUser('user-1')
        expect(result).toHaveLength(1)
        expect(db.listByUser).toHaveBeenCalledWith('user-1')
    })

    test('toggleActive가 활성 상태를 변경한다', async () => {
        const db = createMockDb()
        const service = createSpotifyWidgetTokenService({ db })
        await service.toggleActive('user-1', 1, false)
        expect(db.updateIsActive).toHaveBeenCalledWith('user-1', 1, false)
    })
})
