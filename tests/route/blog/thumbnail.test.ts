import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createThumbnailRoute } from '../../../route/blog/thumbnail'

const mockPostDetail = {
    postId: 1,
    categoryId: 1,
    categoryName: 'Tech',
    title: 'Test',
    description: 'Content',
    updatedAt: new Date(),
    createdAt: new Date(),
    views: 0,
    isPublished: true,
    isHide: false,
    isNotice: false,
    isComment: true,
    tags: [{ tagId: 1, tag: 'TypeScript' }],
}

const createMockDeps = () => ({
    postService: {
        list: mock(() => Promise.resolve({ data: [mockPostDetail], total: 1, page: 1, limit: 20 })),
        getById: mock((id: number) => Promise.resolve(id === 1 ? mockPostDetail : null)),
        getByIdWithoutView: mock((id: number) => Promise.resolve(id === 1 ? mockPostDetail : null)),
        create: mock(() => Promise.resolve({ postId: 2 })),
        update: mock((id: number) => Promise.resolve(id === 1 ? { postId: 1 } : null)),
        delete: mock((id: number) => Promise.resolve(id === 1 ? { postId: 1 } : null)),
    },
    imageGenerator: { generate: mock(() => Promise.resolve(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) },
    fontLoader: { load: mock(() => Promise.resolve(null)) },
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/blog/posts', createThumbnailRoute(deps as never))
    return { app, deps }
}

describe('GET /blog/posts/:id/thumbnail', () => {
    test('조회수를 증가시키지 않는 읽기 전용 조회를 사용한다 (E-07)', async () => {
        const { app, deps } = createApp()

        const res = await app.request('/blog/posts/1/thumbnail')

        expect(res.status).toBe(200)
        expect(deps.postService.getByIdWithoutView).toHaveBeenCalledWith(1)
        expect(deps.postService.getById).not.toHaveBeenCalled()
    })

    test('PNG 응답 헤더를 유지한다', async () => {
        const { app } = createApp()

        const res = await app.request('/blog/posts/1/thumbnail')

        expect(res.headers.get('Content-Type')).toBe('image/png')
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=2592000, immutable')
    })

    test('존재하지 않는 게시글은 404를 반환한다', async () => {
        const { app } = createApp()

        const res = await app.request('/blog/posts/999/thumbnail')

        expect(res.status).toBe(404)
        const body = await res.json()
        expect(body.error.code).toBe('BLOG_POST_NOT_FOUND')
    })

    test('숫자가 아닌 id는 404를 반환한다', async () => {
        const { app } = createApp()

        const res = await app.request('/blog/posts/abc/thumbnail')

        expect(res.status).toBe(404)
    })
})
