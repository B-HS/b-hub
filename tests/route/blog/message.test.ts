import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createMessageRoute } from '../../../route/blog/message'

const createMockDeps = () => ({
    messageService: {
        getUserProfile: mock((userId: string) =>
            Promise.resolve(
                userId === 'user-1'
                    ? {
                          id: 'user-1',
                          name: 'Test',
                          email: 'test@test.com',
                          image: null,
                          followersCount: 0,
                          followingCount: 0,
                      }
                    : null,
            ),
        ),
        list: mock(() =>
            Promise.resolve({
                content: [],
                totalElements: 0,
                totalPages: 0,
                prev: null,
                next: null,
            }),
        ),
        create: mock(() => Promise.resolve({ id: 'msg-new' })),
        delete: mock((id: string) =>
            Promise.resolve(id === 'msg-1' ? { success: true as const, id: 'msg-1' } : { success: false as const, reason: 'not_found' as const }),
        ),
    },
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', role: 'admin' } })),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/blog/messages', createMessageRoute(deps))
    return { app, deps }
}

describe('GET /blog/messages/user/:userId', () => {
    test('사용자별 메시지를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/messages/user/user-1')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
    })
})

describe('GET /blog/messages/user/:userId/profile', () => {
    test('사용자 프로필을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/messages/user/user-1/profile')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.name).toBe('Test')
    })

    test('존재하지 않는 사용자는 404를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/messages/user/unknown/profile')
        expect(res.status).toBe(404)
    })
})

describe('POST /blog/messages', () => {
    test('관리자가 메시지를 작성한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: 'Hello world' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.id).toBe('msg-new')
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/blog/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: 'Hello' }),
        })
        expect(res.status).toBe(401)
    })

    test('관리자가 아니면 403을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve({ user: { id: 'user-1', role: 'user' } }))
        const { app } = createApp(deps)
        const res = await app.request('/blog/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: 'Hello' }),
        })
        expect(res.status).toBe(403)
    })
})

describe('DELETE /blog/messages/:id', () => {
    test('관리자가 메시지를 삭제한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/messages/msg-1', { method: 'DELETE' })
        expect(res.status).toBe(200)
    })

    test('존재하지 않는 메시지는 404를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/messages/msg-999', {
            method: 'DELETE',
        })
        expect(res.status).toBe(404)
    })
})
