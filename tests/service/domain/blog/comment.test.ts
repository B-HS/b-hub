import { describe, expect, test, mock } from 'bun:test'
import { createCommentService } from '../../../../service/domain/blog/comment'

const mockComment = {
    commentId: 1,
    postId: 1,
    userId: 'user-1',
    userName: 'Test User',
    userImage: null,
    comment: 'Great post!',
    updatedAt: new Date(),
    createdAt: new Date(),
    isHide: false,
}

const createMockDb = () => ({
    getCommentsByPostId: mock(() => Promise.resolve([mockComment])),
    getCommentById: mock((id: number) => Promise.resolve(id === 1 ? mockComment : null)),
    insertComment: mock(() => Promise.resolve({ commentId: 2 })),
    updateComment: mock(() => Promise.resolve()),
    deleteComment: mock(() => Promise.resolve()),
})

describe('createCommentService', () => {
    test('listByPostId는 댓글 목록을 반환한다', async () => {
        const db = createMockDb()
        const service = createCommentService({ db })

        const result = await service.listByPostId(1)
        expect(result).toHaveLength(1)
        expect(db.getCommentsByPostId).toHaveBeenCalledWith(1)
    })

    test('create는 댓글을 생성한다', async () => {
        const db = createMockDb()
        const service = createCommentService({ db })

        const result = await service.create('user-1', {
            postId: 1,
            comment: 'New comment',
            isHide: false,
        })
        expect(result.commentId).toBe(2)
        expect(db.insertComment).toHaveBeenCalledWith({
            postId: 1,
            userId: 'user-1',
            comment: 'New comment',
            isHide: false,
        })
    })

    test('update는 자신의 댓글을 수정한다', async () => {
        const db = createMockDb()
        const service = createCommentService({ db })

        const result = await service.update(1, 'user-1', { comment: 'Updated' })
        expect(result.success).toBe(true)
        expect(db.updateComment).toHaveBeenCalledWith(1, { comment: 'Updated' })
    })

    test('update는 존재하지 않는 댓글에 not_found를 반환한다', async () => {
        const db = createMockDb()
        const service = createCommentService({ db })

        const result = await service.update(999, 'user-1', { comment: 'Updated' })
        expect(result.success).toBe(false)
        expect(result.reason).toBe('not_found')
    })

    test('update는 다른 사용자의 댓글에 not_owner를 반환한다', async () => {
        const db = createMockDb()
        const service = createCommentService({ db })

        const result = await service.update(1, 'other-user', { comment: 'Hack' })
        expect(result.success).toBe(false)
        expect(result.reason).toBe('not_owner')
    })

    test('delete는 자신의 댓글을 삭제한다', async () => {
        const db = createMockDb()
        const service = createCommentService({ db })

        const result = await service.delete(1, 'user-1')
        expect(result.success).toBe(true)
        expect(db.deleteComment).toHaveBeenCalledWith(1)
    })

    test('delete는 존재하지 않는 댓글에 not_found를 반환한다', async () => {
        const db = createMockDb()
        const service = createCommentService({ db })

        const result = await service.delete(999, 'user-1')
        expect(result.success).toBe(false)
        expect(result.reason).toBe('not_found')
    })

    test('delete는 다른 사용자의 댓글에 not_owner를 반환한다', async () => {
        const db = createMockDb()
        const service = createCommentService({ db })

        const result = await service.delete(1, 'other-user')
        expect(result.success).toBe(false)
        expect(result.reason).toBe('not_owner')
    })

    test('adminDelete는 댓글을 삭제한다', async () => {
        const db = createMockDb()
        const service = createCommentService({ db })

        const result = await service.adminDelete(1)
        expect(result).not.toBeNull()
        expect(result!.commentId).toBe(1)
    })

    test('adminDelete는 존재하지 않는 댓글에 null을 반환한다', async () => {
        const db = createMockDb()
        const service = createCommentService({ db })

        const result = await service.adminDelete(999)
        expect(result).toBeNull()
    })

    test('adminUpdateHide는 댓글 숨김을 토글한다', async () => {
        const db = createMockDb()
        const service = createCommentService({ db })

        const result = await service.adminUpdateHide(1, true)
        expect(result).not.toBeNull()
        expect(result!.isHide).toBe(true)
        expect(db.updateComment).toHaveBeenCalledWith(1, { isHide: true })
    })

    test('adminUpdateHide는 존재하지 않는 댓글에 null을 반환한다', async () => {
        const db = createMockDb()
        const service = createCommentService({ db })

        const result = await service.adminUpdateHide(999, true)
        expect(result).toBeNull()
    })

    test('listByPostId가 빈 배열을 반환한다', async () => {
        const db = createMockDb()
        db.getCommentsByPostId = mock(() => Promise.resolve([]))
        const service = createCommentService({ db })

        const result = await service.listByPostId(999)
        expect(result).toHaveLength(0)
        expect(db.getCommentsByPostId).toHaveBeenCalledWith(999)
    })

    test('adminUpdateHide가 isHide 값을 올바르게 전달한다', async () => {
        const db = createMockDb()
        const service = createCommentService({ db })

        await service.adminUpdateHide(1, false)
        expect(db.updateComment).toHaveBeenCalledWith(1, { isHide: false })

        const result = await service.adminUpdateHide(1, false)
        expect(result).not.toBeNull()
        expect(result!.isHide).toBe(false)
    })
})
