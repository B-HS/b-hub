import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createPostRoute } from '../../../route/blog/post'

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
    tags: [],
}

const createMockDeps = () => ({
    postService: {
        list: mock(() => Promise.resolve({ data: [mockPostDetail], total: 1, page: 1, limit: 20 })),
        getById: mock((id: number) => Promise.resolve(id === 1 ? mockPostDetail : null)),
        create: mock(() => Promise.resolve({ postId: 2 })),
        update: mock((id: number) => Promise.resolve(id === 1 ? { postId: 1 } : null)),
        delete: mock((id: number) => Promise.resolve(id === 1 ? { postId: 1 } : null)),
    },
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', role: 'admin' } })),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/blog/posts', createPostRoute(deps))
    return { app, deps }
}

describe('GET /blog/posts', () => {
    test('게시글 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/posts')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data).toHaveLength(1)
    })

    test('페이지네이션 정보를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/posts?page=1&limit=10')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.pagination).toBeDefined()
    })
})

describe('GET /blog/posts/:id', () => {
    test('게시글 상세를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/posts/1')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.post.postId).toBe(1)
    })

    test('존재하지 않는 게시글은 404를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/posts/999')
        expect(res.status).toBe(404)
    })
})

describe('POST /blog/posts', () => {
    test('관리자가 게시글을 생성한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'New',
                description: 'Content',
                categoryId: 1,
            }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.postId).toBe(2)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/blog/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'New',
                description: 'Content',
                categoryId: 1,
            }),
        })
        expect(res.status).toBe(401)
    })

    test('관리자가 아니면 403을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve({ user: { id: 'user-1', role: 'user' } }))
        const { app } = createApp(deps)
        const res = await app.request('/blog/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'New',
                description: 'Content',
                categoryId: 1,
            }),
        })
        expect(res.status).toBe(403)
    })
})

describe('PUT /blog/posts/:id', () => {
    test('관리자가 게시글을 수정한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/posts/1', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Updated' }),
        })
        expect(res.status).toBe(200)
    })

    test('존재하지 않는 게시글 수정은 404를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/posts/999', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Updated' }),
        })
        expect(res.status).toBe(404)
    })
})
