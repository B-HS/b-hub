import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { cronAuth } from '../../middleware/cron-auth'
import { errorHandler } from '../../middleware/error-handler'

const CRON_SECRET = 'test-cron-secret-12345'

const createApp = (cronSecret = CRON_SECRET) => {
    const app = new Hono()
    app.use('*', errorHandler())
    app.use('*', cronAuth({ cronSecret }))
    app.get('/test', (c) => c.json({ ok: true }))
    return app
}

describe('cronAuth middleware', () => {
    test('시크릿이 비어있으면 401을 반환한다', async () => {
        const res = await createApp('').request('/test')
        expect(res.status).toBe(401)
    })

    test('Authorization 헤더 없으면 401을 반환한다', async () => {
        const res = await createApp().request('/test')
        expect(res.status).toBe(401)
    })

    test('Bearer 토큰 불일치 시 401을 반환한다', async () => {
        const res = await createApp().request('/test', {
            headers: { Authorization: 'Bearer wrong-secret-value' },
        })
        expect(res.status).toBe(401)
    })

    test('정상 Bearer 토큰이면 통과한다', async () => {
        const res = await createApp().request('/test', {
            headers: { Authorization: `Bearer ${CRON_SECRET}` },
        })
        expect(res.status).toBe(200)
    })
})
