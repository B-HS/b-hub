import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createCommentRoute } from '../../../route/blog/comment'

const createMockDeps = () => ({
    commentService: {
        listByPostId: mock(() =>
            Promise.resolve([
                {
                    commentId: 1,
                    postId: 1,
                    userId: 'user-1',
                    userName: 'Test',
                    userImage: null,
                    comment: 'Great',
                    updatedAt: new Date(),
                    createdAt: new Date(),
                    isHide: false,
                },
            ]),
        ),
        create: mock(() => Promise.resolve({ commentId: 2 })),
        update: mock(() => Promise.resolve({ success: true as const })),
        delete: mock(() => Promise.resolve({ success: true as const })),
        adminDelete: mock(() => Promise.resolve({ commentId: 1 })),
        adminUpdateHide: mock(() => Promise.resolve({ commentId: 1, isHide: true })),
    },
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', role: 'user' } })),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/blog/comments', createCommentRoute(deps))
    return { app, deps }
}

describe('GET /blog/comments', () => {
    test('댓글 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/comments?postId=1')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.comments).toHaveLength(1)
    })

    test('postId 없으면 에러를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/comments')
        expect(res.status).not.toBe(200)
    })
})

describe('POST /blog/comments', () => {
    test('인증된 사용자가 댓글을 작성한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId: 1, comment: 'Nice!' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.commentId).toBe(2)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/blog/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId: 1, comment: 'Hack!' }),
        })
        expect(res.status).toBe(401)
    })
})

describe('PATCH /blog/comments/:id', () => {
    test('자신의 댓글을 수정한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/comments/1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment: 'Updated' }),
        })
        expect(res.status).toBe(200)
    })

    test('댓글이 없으면 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.commentService.update = mock(() =>
            Promise.resolve({
                success: false as const,
                reason: 'not_found' as const,
            }),
        )
        const { app } = createApp(deps)
        const res = await app.request('/blog/comments/999', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment: 'Updated' }),
        })
        expect(res.status).toBe(404)
    })

    test('다른 사용자의 댓글이면 403을 반환한다', async () => {
        const deps = createMockDeps()
        deps.commentService.update = mock(() =>
            Promise.resolve({
                success: false as const,
                reason: 'not_owner' as const,
            }),
        )
        const { app } = createApp(deps)
        const res = await app.request('/blog/comments/1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment: 'Hack' }),
        })
        expect(res.status).toBe(403)
    })
})

describe('DELETE /blog/comments/:id', () => {
    test('자신의 댓글을 삭제한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/comments/1', { method: 'DELETE' })
        expect(res.status).toBe(200)
    })
})
