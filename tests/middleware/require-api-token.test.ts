import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { requireApiToken } from '../../middleware/require-api-token'
import { errorHandler } from '../../middleware/error-handler'

const createApp = (validateToken: (token: string) => Promise<{ id: string } | null>) => {
    const app = new Hono()
    app.use('*', errorHandler())
    app.use('*', requireApiToken({ validateToken }))
    app.get('/test', (c) => c.json({ user: c.get('user') }))
    return app
}

describe('requireApiToken middleware', () => {
    test('X-API-Token 헤더 누락 시 401을 반환한다', async () => {
        const validateToken = mock(() => Promise.resolve({ id: 'user-1' }))
        const res = await createApp(validateToken).request('/test')
        expect(res.status).toBe(401)
    })

    test('토큰이 무효하면 401을 반환한다', async () => {
        const validateToken = mock(() => Promise.resolve(null))
        const res = await createApp(validateToken).request('/test', {
            headers: { 'X-API-Token': 'invalid-token' },
        })
        expect(res.status).toBe(401)
    })

    test('유효한 토큰이면 통과하고 user를 설정한다', async () => {
        const validateToken = mock(() => Promise.resolve({ id: 'user-1' }))
        const res = await createApp(validateToken).request('/test', {
            headers: { 'X-API-Token': 'valid-token' },
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.user.id).toBe('user-1')
    })
})
