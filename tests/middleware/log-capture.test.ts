import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { logCapture } from '../../middleware/log-capture'

type CaptureArg = { service: string; errorCode: string; severity: number }

const createApp = (capture: ReturnType<typeof mock>) => {
    const app = new Hono()
    app.use('*', logCapture({ logEventService: { captureServerError: capture } as never }))
    app.get('/api/mail/ok', (c) => c.json({ ok: true }))
    app.get('/api/mail/boom', (c) => {
        c.set('errorCode', 'MAIL_PROVIDER_ERROR')
        return c.json({ e: 1 }, 502)
    })
    app.get('/api/mail/notfound', (c) => c.json({ e: 1 }, 404))
    app.get('/api/logs', (c) => c.json({ e: 1 }, 401))
    return app
}

describe('logCapture middleware', () => {
    test('2xx 응답은 캡처하지 않는다', async () => {
        const capture = mock(async (_e: CaptureArg) => {})
        await createApp(capture).request('/api/mail/ok')
        expect(capture).not.toHaveBeenCalled()
    })

    test('5xx 응답은 service·errorCode·severity와 함께 캡처한다', async () => {
        const capture = mock(async (_e: CaptureArg) => {})
        await createApp(capture).request('/api/mail/boom')
        expect(capture).toHaveBeenCalledTimes(1)
        const arg = capture.mock.calls[0][0] as CaptureArg
        expect(arg.service).toBe('b-hub-mail')
        expect(arg.errorCode).toBe('MAIL_PROVIDER_ERROR')
        expect(arg.severity).toBe(40)
    })

    test('4xx 응답은 WARN(30)으로 캡처한다', async () => {
        const capture = mock(async (_e: CaptureArg) => {})
        await createApp(capture).request('/api/mail/notfound')
        expect(capture).toHaveBeenCalledTimes(1)
        expect((capture.mock.calls[0][0] as CaptureArg).severity).toBe(30)
    })

    test('/api/logs 경로는 캡처하지 않는다 (자기참조·재귀 방지)', async () => {
        const capture = mock(async (_e: CaptureArg) => {})
        await createApp(capture).request('/api/logs')
        expect(capture).not.toHaveBeenCalled()
    })

    test('captureServerError가 reject해도 응답을 차단하지 않는다', async () => {
        const capture = mock(async (_e: CaptureArg) => {
            throw new Error('db down')
        })
        const res = await createApp(capture).request('/api/mail/boom')
        expect(res.status).toBe(502)
    })
})
