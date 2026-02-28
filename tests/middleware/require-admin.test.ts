import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { requireAdmin } from '../../middleware/require-admin'
import { errorHandler } from '../../middleware/error-handler'

const mockAdmin = { id: 'admin-1', name: 'Admin', email: 'admin@test.com', role: 'admin', image: null }
const mockUser = { id: 'user-1', name: 'User', email: 'user@test.com', role: 'user', image: null }

const createApp = (getSession: Parameters<typeof requireAdmin>[0]['getSession']) => {
    const app = new Hono()
    app.use('*', errorHandler())
    app.use('*', requireAdmin({ getSession }))
    app.get('/test', (c) => c.json({ ok: true }))
    return app
}

describe('requireAdmin middleware', () => {
    test('세션 없으면 401을 반환한다', async () => {
        const getSession = mock(() => Promise.resolve(null))
        const res = await createApp(getSession).request('/test')
        expect(res.status).toBe(401)
    })

    test('role이 admin이 아니면 403을 반환한다', async () => {
        const getSession = mock(() => Promise.resolve({ user: mockUser }))
        const res = await createApp(getSession).request('/test')
        expect(res.status).toBe(403)
    })

    test('admin이면 통과한다', async () => {
        const getSession = mock(() => Promise.resolve({ user: mockAdmin }))
        const res = await createApp(getSession).request('/test')
        expect(res.status).toBe(200)
    })
})
