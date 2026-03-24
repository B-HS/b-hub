import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { withAuth, withAdmin, withApiToken } from '../../lib/with-auth'
import { withErrorHandling } from '../../lib/with-error-handling'

const mockUser = {
    id: 'u1',
    name: 'Test',
    email: 'test@test.com',
    role: 'user',
    image: null,
}
const mockAdmin = {
    id: 'u2',
    name: 'Admin',
    email: 'admin@test.com',
    role: 'admin',
    image: null,
}

describe('withAuth', () => {
    test('세션이 있으면 핸들러를 실행한다', async () => {
        const getSession = mock(() => Promise.resolve({ user: mockUser }))
        const app = new Hono()
        app.get('/test', withErrorHandling(withAuth({ getSession })(async (c, user) => c.json({ userId: user.id }))))

        const res = await app.request('/test')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.userId).toBe('u1')
    })

    test('세션이 없으면 401을 반환한다', async () => {
        const getSession = mock(() => Promise.resolve(null))
        const app = new Hono()
        app.get('/test', withErrorHandling(withAuth({ getSession })(async (c) => c.json({ ok: true }))))

        const res = await app.request('/test')
        expect(res.status).toBe(401)
    })
})

describe('withAdmin', () => {
    test('admin 역할이면 핸들러를 실행한다', async () => {
        const getSession = mock(() => Promise.resolve({ user: mockAdmin }))
        const app = new Hono()
        app.get('/test', withErrorHandling(withAdmin({ getSession })(async (c, user) => c.json({ role: user.role }))))

        const res = await app.request('/test')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.role).toBe('admin')
    })

    test('admin이 아니면 403을 반환한다', async () => {
        const getSession = mock(() => Promise.resolve({ user: mockUser }))
        const app = new Hono()
        app.get('/test', withErrorHandling(withAdmin({ getSession })(async (c) => c.json({ ok: true }))))

        const res = await app.request('/test')
        expect(res.status).toBe(403)
    })

    test('세션이 없으면 401을 반환한다', async () => {
        const getSession = mock(() => Promise.resolve(null))
        const app = new Hono()
        app.get('/test', withErrorHandling(withAdmin({ getSession })(async (c) => c.json({ ok: true }))))

        const res = await app.request('/test')
        expect(res.status).toBe(401)
    })
})

describe('withApiToken', () => {
    test('유효한 토큰이면 핸들러를 실행한다', async () => {
        const validateToken = mock(() => Promise.resolve(mockUser))
        const app = new Hono()
        app.get('/test', withErrorHandling(withApiToken({ validateToken })(async (c, user) => c.json({ userId: user.id }))))

        const res = await app.request('/test', {
            headers: { 'X-API-Token': 'valid-token' },
        })
        expect(res.status).toBe(200)
    })

    test('토큰 헤더가 없으면 401을 반환한다', async () => {
        const validateToken = mock(() => Promise.resolve(null))
        const app = new Hono()
        app.get('/test', withErrorHandling(withApiToken({ validateToken })(async (c) => c.json({ ok: true }))))

        const res = await app.request('/test')
        expect(res.status).toBe(401)
    })

    test('유효하지 않은 토큰이면 401을 반환한다', async () => {
        const validateToken = mock(() => Promise.resolve(null))
        const app = new Hono()
        app.get('/test', withErrorHandling(withApiToken({ validateToken })(async (c) => c.json({ ok: true }))))

        const res = await app.request('/test', {
            headers: { 'X-API-Token': 'bad' },
        })
        expect(res.status).toBe(401)
    })

    test('빈 토큰 헤더는 401을 반환한다', async () => {
        const validateToken = mock(() => Promise.resolve(mockUser))
        const app = new Hono()
        app.get('/test', withErrorHandling(withApiToken({ validateToken })(async (c) => c.json({ ok: true }))))

        const res = await app.request('/test', {
            headers: { 'X-API-Token': '' },
        })
        expect(res.status).toBe(401)
    })

    test('validateToken 에러가 전파된다', async () => {
        const validateToken = mock(() => Promise.reject(new Error('token service down')))
        const app = new Hono()
        app.get('/test', withErrorHandling(withApiToken({ validateToken })(async (c) => c.json({ ok: true }))))

        const res = await app.request('/test', {
            headers: { 'X-API-Token': 'some-token' },
        })
        expect(res.status).toBe(500)
    })
})
