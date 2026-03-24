import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { requireAuth } from '../../middleware/require-auth'
import { errorHandler } from '../../middleware/error-handler'

const mockUser = { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'user', image: null }

const createApp = (getSession: Parameters<typeof requireAuth>[0]['getSession']) => {
    const app = new Hono()
    app.use('*', errorHandler())
    app.use('*', requireAuth({ getSession }))
    app.get('/test', (c) => c.json({ user: c.get('user') }))
    return app
}

describe('requireAuth middleware', () => {
    test('세션 없으면 401을 반환한다', async () => {
        const getSession = mock(() => Promise.resolve(null))
        const res = await createApp(getSession).request('/test')
        expect(res.status).toBe(401)
    })

    test('세션 있으면 next를 호출하고 user를 설정한다', async () => {
        const getSession = mock(() => Promise.resolve({ user: mockUser }))
        const res = await createApp(getSession).request('/test')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.user.id).toBe('user-1')
    })

    test('getSession이 에러를 던지면 500을 반환한다', async () => {
        const getSession = mock(async () => {
            throw new Error('session fetch failed')
        }) as Parameters<typeof requireAuth>[0]['getSession']
        const res = await createApp(getSession).request('/test')
        expect(res.status).toBe(500)
    })
})
