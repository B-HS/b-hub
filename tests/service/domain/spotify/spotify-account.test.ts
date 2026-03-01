import { describe, expect, test, mock } from 'bun:test'
import { createSpotifyAccountService } from '../../../../service/domain/spotify/spotify-account'

const mockAccount = (overrides = {}) => ({
    id: 1,
    userId: 'user-1',
    spotifyUserId: 'spotify-user-1',
    displayName: 'Test User',
    email: 'test@email.com',
    betterAuthAccountId: 'ba-1',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
})

const createMockDb = () => ({
    list: mock(() => Promise.resolve([mockAccount()])),
    getById: mock((id: number) => Promise.resolve(id === 1 ? mockAccount() : null)),
    update: mock(() => Promise.resolve()),
    remove: mock(() => Promise.resolve()),
})

describe('createSpotifyAccountService', () => {
    describe('list', () => {
        test('계정 목록을 반환한다', async () => {
            const db = createMockDb()
            const service = createSpotifyAccountService({ db })
            const result = await service.list('user-1')
            expect(result).toHaveLength(1)
            expect(db.list).toHaveBeenCalledWith('user-1')
        })
    })

    describe('getById', () => {
        test('소유한 계정을 반환한다', async () => {
            const db = createMockDb()
            const service = createSpotifyAccountService({ db })
            const result = await service.getById(1, 'user-1')
            expect(result.id).toBe(1)
        })

        test('없는 계정은 에러를 발생시킨다', async () => {
            const db = createMockDb()
            const service = createSpotifyAccountService({ db })
            await expect(service.getById(999, 'user-1')).rejects.toMatchObject({
                code: 'SPOTIFY_ACCOUNT_NOT_FOUND',
            })
        })

        test('다른 사용자의 계정은 에러를 발생시킨다', async () => {
            const db = createMockDb()
            const service = createSpotifyAccountService({ db })
            await expect(service.getById(1, 'user-2')).rejects.toMatchObject({
                code: 'SPOTIFY_ACCOUNT_NOT_FOUND',
            })
        })
    })

    describe('update', () => {
        test('displayName을 수정한다', async () => {
            const db = createMockDb()
            const service = createSpotifyAccountService({ db })
            await service.update(1, 'user-1', { displayName: 'New Name' })
            expect(db.update).toHaveBeenCalledWith(1, { displayName: 'New Name' })
        })

        test('isActive를 수정한다', async () => {
            const db = createMockDb()
            const service = createSpotifyAccountService({ db })
            await service.update(1, 'user-1', { isActive: false })
            expect(db.update).toHaveBeenCalledWith(1, { isActive: false })
        })

        test('소유권 검증 실패 시 에러를 발생시킨다', async () => {
            const db = createMockDb()
            const service = createSpotifyAccountService({ db })
            await expect(service.update(1, 'user-2', { displayName: 'x' })).rejects.toMatchObject({
                code: 'SPOTIFY_ACCOUNT_NOT_FOUND',
            })
        })
    })

    describe('remove', () => {
        test('계정을 삭제한다', async () => {
            const db = createMockDb()
            const service = createSpotifyAccountService({ db })
            await service.remove(1, 'user-1')
            expect(db.remove).toHaveBeenCalledWith(1)
        })

        test('소유권 검증 실패 시 에러를 발생시킨다', async () => {
            const db = createMockDb()
            const service = createSpotifyAccountService({ db })
            await expect(service.remove(1, 'user-2')).rejects.toMatchObject({
                code: 'SPOTIFY_ACCOUNT_NOT_FOUND',
            })
        })
    })
})
