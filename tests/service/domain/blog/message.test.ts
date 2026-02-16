import { describe, expect, test, mock } from 'bun:test'
import { createMessageService } from '../../../../service/domain/blog/message'

const mockMessage = {
    id: 'msg-1',
    userId: 'user-1',
    body: 'Hello world',
    replyToId: null,
    retweetOfId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    images: [],
    user: { id: 'user-1', name: 'Test', image: null },
}

const mockProfile = {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    image: null,
    followersCount: 10,
    followingCount: 5,
}

const createMockDb = () => ({
    getUserProfile: mock((userId: string) => Promise.resolve(userId === 'user-1' ? mockProfile : null)),
    getMessagesByUserId: mock(() =>
        Promise.resolve({
            content: [mockMessage],
            totalElements: 1,
            totalPages: 1,
            prev: null,
            next: null,
        }),
    ),
    insertMessage: mock(() => Promise.resolve({ id: 'msg-new' })),
    deleteMessage: mock(() => Promise.resolve({ id: 'msg-1' })),
    getMessageById: mock((id: string) => Promise.resolve(id === 'msg-1' ? mockMessage : null)),
})

describe('createMessageService', () => {
    test('getUserProfile은 프로필을 반환한다', async () => {
        const db = createMockDb()
        const service = createMessageService({ db })

        const result = await service.getUserProfile('user-1')
        expect(result).not.toBeNull()
        expect(result!.name).toBe('Test User')
    })

    test('getUserProfile은 존재하지 않는 유저에 null을 반환한다', async () => {
        const db = createMockDb()
        const service = createMessageService({ db })

        const result = await service.getUserProfile('unknown')
        expect(result).toBeNull()
    })

    test('list는 메시지 목록을 반환한다', async () => {
        const db = createMockDb()
        const service = createMessageService({ db })

        const result = await service.list('user-1', 1, 20)
        expect(result.content).toHaveLength(1)
        expect(result.totalElements).toBe(1)
        expect(db.getMessagesByUserId).toHaveBeenCalledWith({
            userId: 'user-1',
            page: 1,
            size: 20,
        })
    })

    test('create는 메시지를 생성한다', async () => {
        const db = createMockDb()
        const service = createMessageService({ db })

        const result = await service.create('user-1', {
            body: 'New message',
            imageIds: ['img-1'],
            replyToId: null,
            retweetOfId: null,
        })
        expect(result.id).toBe('msg-new')
        expect(db.insertMessage).toHaveBeenCalledWith({
            userId: 'user-1',
            body: 'New message',
            imageIds: ['img-1'],
            replyToId: null,
            retweetOfId: null,
        })
    })

    test('delete는 자신의 메시지를 삭제한다', async () => {
        const db = createMockDb()
        const service = createMessageService({ db })

        const result = await service.delete('msg-1', 'user-1')
        expect(result.success).toBe(true)
    })

    test('delete는 존재하지 않는 메시지에 not_found를 반환한다', async () => {
        const db = createMockDb()
        const service = createMessageService({ db })

        const result = await service.delete('msg-999', 'user-1')
        expect(result.success).toBe(false)
        expect(result.reason).toBe('not_found')
    })

    test('delete는 다른 사용자의 메시지에 not_owner를 반환한다', async () => {
        const db = createMockDb()
        const service = createMessageService({ db })

        const result = await service.delete('msg-1', 'other-user')
        expect(result.success).toBe(false)
        expect(result.reason).toBe('not_owner')
    })
})
