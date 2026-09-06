import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createAdminRoute } from '../../../route/blog/admin'

const createMockDeps = () => ({
    postService: {
        list: mock(() => Promise.resolve({ data: [], total: 0, page: 1, limit: 20 })),
        getById: mock(() => Promise.resolve(null)),
        getByIdWithoutView: mock(() => Promise.resolve(null)),
        create: mock(() => Promise.resolve({ postId: 1 })),
        update: mock((id: number) => Promise.resolve(id === 1 ? { postId: 1 } : null)),
        delete: mock((id: number) => Promise.resolve(id === 1 ? { postId: 1 } : null)),
    },
    commentService: {
        listByPostId: mock(() => Promise.resolve([])),
        create: mock(() => Promise.resolve({ commentId: 1 })),
        update: mock(() => Promise.resolve({ success: true as const })),
        delete: mock(() => Promise.resolve({ success: true as const })),
        adminDelete: mock((id: number) => Promise.resolve(id === 1 ? { commentId: 1 } : null)),
        adminUpdateHide: mock((id: number, isHide: boolean) => Promise.resolve(id === 1 ? { commentId: 1, isHide } : null)),
    },
    getSession: mock(() => Promise.resolve({ user: { id: 'admin-1', role: 'admin' } })),
    db: {
        getAllUsers: mock(() =>
            Promise.resolve([
                {
                    id: 'user-1',
                    name: 'Test',
                    email: 'test@test.com',
                    image: null,
                    role: 'user',
                    createdAt: new Date(),
                    postsCount: 5,
                    commentsCount: 10,
                },
            ]),
        ),
        getAllPosts: mock(() =>
            Promise.resolve([
                {
                    postId: 1,
                    categoryId: 1,
                    categoryName: 'Tech',
                    title: 'Test',
                    isPublished: true,
                    isHide: false,
                    createdAt: new Date(),
                },
            ]),
        ),
        getAllComments: mock(() =>
            Promise.resolve([
                {
                    commentId: 1,
                    postId: 1,
                    postTitle: 'Test',
                    userId: 'user-1',
                    userName: 'Test',
                    comment: 'Great',
                    isHide: false,
                    createdAt: new Date(),
                },
            ]),
        ),
        deleteUser: mock(() => Promise.resolve({ id: 'user-1' })),
    },
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/blog/admin', createAdminRoute(deps))
    return { app, deps }
}

describe('GET /blog/admin/users', () => {
    test('관리자가 사용자 목록을 조회한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/admin/users')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.users).toHaveLength(1)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/blog/admin/users')
        expect(res.status).toBe(401)
    })

    test('관리자가 아니면 403을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve({ user: { id: 'user-1', role: 'user' } }))
        const { app } = createApp(deps)
        const res = await app.request('/blog/admin/users')
        expect(res.status).toBe(403)
    })
})

describe('DELETE /blog/admin/users/:id', () => {
    test('관리자가 사용자를 삭제한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/admin/users/user-1', {
            method: 'DELETE',
        })
        expect(res.status).toBe(200)
    })
})

describe('GET /blog/admin/posts', () => {
    test('관리자가 전체 게시글을 조회한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/admin/posts')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.posts).toHaveLength(1)
    })
})

describe('DELETE /blog/admin/posts/:id', () => {
    test('관리자가 게시글을 삭제한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/admin/posts/1', { method: 'DELETE' })
        expect(res.status).toBe(200)
    })

    test('존재하지 않는 게시글은 404를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/admin/posts/999', {
            method: 'DELETE',
        })
        expect(res.status).toBe(404)
    })
})

describe('PATCH /blog/admin/posts/:id', () => {
    test('관리자가 게시글 숨김을 토글한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/admin/posts/1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isHide: true }),
        })
        expect(res.status).toBe(200)
    })
})

describe('GET /blog/admin/comments', () => {
    test('관리자가 전체 댓글을 조회한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/admin/comments')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.comments).toHaveLength(1)
    })
})

describe('DELETE /blog/admin/comments/:id', () => {
    test('관리자가 댓글을 삭제한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/admin/comments/1', {
            method: 'DELETE',
        })
        expect(res.status).toBe(200)
    })

    test('존재하지 않는 댓글은 404를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/admin/comments/999', {
            method: 'DELETE',
        })
        expect(res.status).toBe(404)
    })
})

describe('PATCH /blog/admin/comments/:id', () => {
    test('관리자가 댓글 숨김을 토글한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/admin/comments/1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isHide: true }),
        })
        expect(res.status).toBe(200)
    })

    test('존재하지 않는 댓글은 404를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/admin/comments/999', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isHide: true }),
        })
        expect(res.status).toBe(404)
    })
})
