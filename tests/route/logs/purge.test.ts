import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createLogEventRoute } from '../../../route/logs/log-event'
import { errorHandler } from '../../../middleware/error-handler'

const CRON_SECRET = 'cron-secret'

const adminSession = { user: { id: 'admin-1', name: 'admin', email: 'a@b.c', role: 'admin', image: null } }

const createApp = (session: typeof adminSession | null = null) => {
    const purgeByPolicy = mock(() => Promise.resolve({ infoDeleted: 1, warnDeleted: 2, errorDeleted: 3 }))
    const purgeRetention = mock(() => Promise.resolve({ weatherApiLogDeleted: 4, mailSyncLogDeleted: 5, mailSyncSessionDeleted: 6 }))

    const app = new Hono()
    app.use('*', errorHandler())
    app.route(
        '/logs',
        createLogEventRoute({
            logEventService: { purgeByPolicy, purgeRetention } as never,
            deviceKeyService: {} as never,
            getSession: (() => Promise.resolve(session)) as never,
            cronSecret: CRON_SECRET,
        }),
    )

    return { app, purgeByPolicy, purgeRetention }
}

describe('GET /logs/purge (Cron)', () => {
    test('Bearer 크론 시크릿이면 정책 purge 와 보존 삭제를 모두 수행한다', async () => {
        const { app, purgeByPolicy, purgeRetention } = createApp()
        const res = await app.request('/logs/purge', { headers: { Authorization: `Bearer ${CRON_SECRET}` } })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
            success: true,
            data: { infoDeleted: 1, warnDeleted: 2, errorDeleted: 3, weatherApiLogDeleted: 4, mailSyncLogDeleted: 5, mailSyncSessionDeleted: 6 },
        })
        expect(purgeByPolicy).toHaveBeenCalledTimes(1)
        expect(purgeRetention).toHaveBeenCalledTimes(1)
    })

    test('x-cron-secret 헤더도 지원한다', async () => {
        const { app } = createApp()
        const res = await app.request('/logs/purge', { headers: { 'x-cron-secret': CRON_SECRET } })
        expect(res.status).toBe(200)
    })

    test('시크릿이 틀리면 401이고 삭제하지 않는다', async () => {
        const { app, purgeByPolicy } = createApp()
        const res = await app.request('/logs/purge', { headers: { Authorization: 'Bearer wrong-secret' } })

        expect(res.status).toBe(401)
        expect(purgeByPolicy).not.toHaveBeenCalled()
    })
})

describe('POST /logs/purge (기존 어드민 경로)', () => {
    test('어드민 세션이면 정책 purge 만 수행하고 응답 형태는 그대로다', async () => {
        const { app, purgeRetention } = createApp(adminSession)
        const res = await app.request('/logs/purge', { method: 'POST' })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ success: true, data: { infoDeleted: 1, warnDeleted: 2, errorDeleted: 3 } })
        expect(purgeRetention).not.toHaveBeenCalled()
    })

    test('크론 시크릿 헤더가 있어도 POST 는 크론 분기를 타지 않고 세션 없이는 401 이다', async () => {
        const { app, purgeByPolicy, purgeRetention } = createApp()
        const res = await app.request('/logs/purge', { method: 'POST', headers: { Authorization: `Bearer ${CRON_SECRET}` } })

        expect(res.status).toBe(401)
        expect(purgeByPolicy).not.toHaveBeenCalled()
        expect(purgeRetention).not.toHaveBeenCalled()
    })

    test('세션이 없으면 401이다', async () => {
        const { app } = createApp()
        const res = await app.request('/logs/purge', { method: 'POST' })
        expect(res.status).toBe(401)
    })
})
