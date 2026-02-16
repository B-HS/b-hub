import { describe, expect, test, mock } from 'bun:test'
import { createPostService } from '../../../../service/domain/blog/post'

const mockPostDetail = {
    postId: 1,
    categoryId: 1,
    categoryName: 'Tech',
    title: 'Test Post',
    description: 'Content',
    updatedAt: new Date(),
    createdAt: new Date(),
    views: 10,
    isPublished: true,
    isHide: false,
    isNotice: false,
    isComment: true,
    tags: [{ tagId: 1, tag: 'TypeScript' }],
}

const createMockDb = () => ({
    getPostList: mock(() => Promise.resolve({ data: [mockPostDetail], total: 1 })),
    getPostById: mock((id: number) => Promise.resolve(id === 1 ? mockPostDetail : null)),
    insertPost: mock(() => Promise.resolve({ postId: 2 })),
    updatePost: mock(() => Promise.resolve({ postId: 1 })),
    deletePost: mock(() => Promise.resolve({ postId: 1 })),
    incrementViews: mock(() => Promise.resolve()),
})

describe('createPostService', () => {
    test('list는 게시글 목록을 반환한다', async () => {
        const db = createMockDb()
        const service = createPostService({ db })

        const result = await service.list({ page: 1, limit: 20 })
        expect(result.data).toHaveLength(1)
        expect(result.total).toBe(1)
        expect(result.page).toBe(1)
        expect(db.getPostList).toHaveBeenCalledWith({
            offset: 0,
            limit: 20,
            keyword: undefined,
            categoryId: undefined,
            tagId: undefined,
            isPublished: undefined,
            isHide: undefined,
            isNotice: undefined,
        })
    })

    test('list는 올바른 offset을 계산한다', async () => {
        const db = createMockDb()
        const service = createPostService({ db })

        await service.list({ page: 3, limit: 10 })
        expect(db.getPostList).toHaveBeenCalledWith(
            expect.objectContaining({
                offset: 20,
                limit: 10,
            }),
        )
    })

    test('list는 필터를 전달한다', async () => {
        const db = createMockDb()
        const service = createPostService({ db })

        await service.list({
            page: 1,
            limit: 20,
            keyword: 'test',
            categoryId: 2,
            isPublished: true,
        })
        expect(db.getPostList).toHaveBeenCalledWith(
            expect.objectContaining({
                keyword: 'test',
                categoryId: 2,
                isPublished: true,
            }),
        )
    })

    test('getById는 게시글을 반환하고 조회수를 증가시킨다', async () => {
        const db = createMockDb()
        const service = createPostService({ db })

        const result = await service.getById(1)
        expect(result).not.toBeNull()
        expect(result!.postId).toBe(1)
        expect(db.incrementViews).toHaveBeenCalledWith(1)
    })

    test('getById는 존재하지 않는 게시글에 null을 반환한다', async () => {
        const db = createMockDb()
        const service = createPostService({ db })

        const result = await service.getById(999)
        expect(result).toBeNull()
        expect(db.incrementViews).not.toHaveBeenCalled()
    })

    test('create는 게시글을 생성한다', async () => {
        const db = createMockDb()
        const service = createPostService({ db })

        const result = await service.create({
            title: 'New Post',
            description: 'Content',
            categoryId: 1,
            tagIds: [1, 2],
            isPublished: true,
        })
        expect(result.postId).toBe(2)
        expect(db.insertPost).toHaveBeenCalledWith({
            title: 'New Post',
            description: 'Content',
            categoryId: 1,
            tagIds: [1, 2],
            isPublished: true,
        })
    })

    test('update는 게시글을 수정한다', async () => {
        const db = createMockDb()
        const service = createPostService({ db })

        const result = await service.update(1, { title: 'Updated' })
        expect(result).not.toBeNull()
        expect(result!.postId).toBe(1)
    })

    test('update는 존재하지 않는 게시글에 null을 반환한다', async () => {
        const db = createMockDb()
        const service = createPostService({ db })

        const result = await service.update(999, { title: 'Updated' })
        expect(result).toBeNull()
    })

    test('delete는 게시글을 삭제한다', async () => {
        const db = createMockDb()
        const service = createPostService({ db })

        const result = await service.delete(1)
        expect(result).not.toBeNull()
        expect(db.deletePost).toHaveBeenCalledWith(1)
    })

    test('delete는 존재하지 않는 게시글에 null을 반환한다', async () => {
        const db = createMockDb()
        const service = createPostService({ db })

        const result = await service.delete(999)
        expect(result).toBeNull()
    })
})
