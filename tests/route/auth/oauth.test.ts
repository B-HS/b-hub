import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createOAuthRoute } from '../../../route/auth/oauth'

const createApp = () => {
    const handler = mock(
        (req: Request) => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const app = new Hono()
    const route = createOAuthRoute({ auth: { handler } as never })
    app.route('/auth', route)
    return { app, handler }
}

describe('createOAuthRoute', () => {
    test('GET 요청을 auth.handler에 위임한다', async () => {
        const { app, handler } = createApp()
        const res = await app.request('/auth/callback')
        expect(res.status).toBe(200)
        expect(handler).toHaveBeenCalled()
    })

    test('POST 요청을 auth.handler에 위임한다', async () => {
        const { app, handler } = createApp()
        const res = await app.request('/auth/signin', { method: 'POST' })
        expect(res.status).toBe(200)
        expect(handler).toHaveBeenCalled()
    })

    test('와일드카드 경로를 처리한다', async () => {
        const { app } = createApp()
        const res = await app.request('/auth/some/deep/path')
        expect(res.status).toBe(200)
    })
})
