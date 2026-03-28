import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { healthRoute } from '../../route/health'

const createApp = () => {
    const app = new Hono()
    app.route('/health', healthRoute)
    return app
}

describe('GET /health', () => {
    test('HTTP 200을 반환한다', async () => {
        const app = createApp()
        const res = await app.request('/health')
        expect(res.status).toBe(200)
    })

    test('status ok를 반환한다', async () => {
        const app = createApp()
        const res = await app.request('/health')
        const body = (await res.json()) as { status: string }
        expect(body.status).toBe('ok')
    })

    test('timestamp가 ISO 형식이다', async () => {
        const app = createApp()
        const res = await app.request('/health')
        const body = (await res.json()) as { timestamp: string }
        expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
})
