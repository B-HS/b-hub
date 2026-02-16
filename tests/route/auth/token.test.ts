import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createTokenRoute } from '../../../route/auth/token'

const mockUser = {
    id: 'u1',
    name: 'Test',
    email: 'test@test.com',
    role: 'user',
    image: null,
}

const createMockDeps = () => {
    const tokens = [
        {
            id: 1,
            userId: 'u1',
            token: 'tok_abc',
            name: 'My Token',
            expiresAt: null,
            lastUsedAt: null,
            createdAt: new Date('2025-01-01'),
        },
    ]

    return {
        apiTokenService: {
            create: mock(() => Promise.resolve('tok_new_token_64chars_hex')),
            validate: mock(() => Promise.resolve({ id: 'u1', token: 'tok_abc' })),
            revoke: mock(() => Promise.resolve()),
            listByUser: mock(() => Promise.resolve(tokens)),
        },
        getSession: mock(() => Promise.resolve({ user: mockUser })),
    }
}

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/auth/token', createTokenRoute(deps))
    return { app, deps }
}

describe('GET /auth/token', () => {
    test('인증된 유저의 토큰 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/auth/token')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data).toHaveLength(1)
        expect(body.data[0].id).toBe(1)
        expect(body.data[0].name).toBe('My Token')
    })

    test('인증되지 않으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/auth/token')
        expect(res.status).toBe(401)
    })
})

describe('POST /auth/token', () => {
    test('새 토큰을 발급한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'New Token' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.token).toBe('tok_new_token_64chars_hex')
        expect(deps.apiTokenService.create).toHaveBeenCalledWith('u1', 'New Token')
    })

    test('name 없이도 발급한다', async () => {
        const { app } = createApp()
        const res = await app.request('/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        })
        expect(res.status).toBe(200)
    })

    test('인증되지 않으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        })
        expect(res.status).toBe(401)
    })
})

describe('DELETE /auth/token', () => {
    test('토큰을 삭제한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/auth/token', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'tok_abc' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(deps.apiTokenService.revoke).toHaveBeenCalledWith('u1', 'tok_abc')
    })

    test('token 필드가 없으면 실패한다', async () => {
        const { app } = createApp()
        const res = await app.request('/auth/token', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        })
        expect(res.status).not.toBe(200)
    })

    test('인증되지 않으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/auth/token', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'abc' }),
        })
        expect(res.status).toBe(401)
    })
})
