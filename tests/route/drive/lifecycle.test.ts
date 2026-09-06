import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createDriveLifecycleRoute } from '../../../route/drive/lifecycle'

const CRON_SECRET = 'cron-secret'

const createMockDeps = () => ({
    storageLifecycleService: {
        evictR2Stale: mock(() => Promise.resolve(3)),
        evictLocalFifo: mock(() => Promise.resolve(0)),
        autoPromote: mock(() => Promise.resolve(2)),
    },
    uploadServerSecret: CRON_SECRET,
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/lifecycle', createDriveLifecycleRoute(deps))
    return { app, deps }
}

describe('createDriveLifecycleRoute', () => {
    describe('GET 크론 호출', () => {
        test('evict-r2 를 GET 으로 호출하면 evicted 를 반환한다', async () => {
            const { app, deps } = createApp()
            const res = await app.request('/lifecycle/evict-r2', { headers: { Authorization: `Bearer ${CRON_SECRET}` } })

            expect(res.status).toBe(200)
            expect(await res.json()).toEqual({ success: true, data: { evicted: 3 } })
            expect(deps.storageLifecycleService.evictR2Stale).toHaveBeenCalledTimes(1)
        })

        test('evict-local 을 GET 으로 호출하면 evicted 를 반환한다', async () => {
            const { app } = createApp()
            const res = await app.request('/lifecycle/evict-local', { headers: { 'x-cron-secret': CRON_SECRET } })

            expect(res.status).toBe(200)
            expect(await res.json()).toEqual({ success: true, data: { evicted: 0 } })
        })

        test('auto-promote 를 GET 으로 호출하면 promoted 를 반환한다', async () => {
            const { app } = createApp()
            const res = await app.request('/lifecycle/auto-promote', { headers: { Authorization: `Bearer ${CRON_SECRET}` } })

            expect(res.status).toBe(200)
            expect(await res.json()).toEqual({ success: true, data: { promoted: 2 } })
        })
    })

    describe('POST 크론 호출', () => {
        test('evict-r2 를 POST 로 호출해도 동일하게 동작한다', async () => {
            const { app } = createApp()
            const res = await app.request('/lifecycle/evict-r2', { method: 'POST', headers: { Authorization: `Bearer ${CRON_SECRET}` } })

            expect(res.status).toBe(200)
            expect(await res.json()).toEqual({ success: true, data: { evicted: 3 } })
        })

        test('auto-promote 를 POST 로 호출해도 동일하게 동작한다', async () => {
            const { app } = createApp()
            const res = await app.request('/lifecycle/auto-promote', { method: 'POST', headers: { 'x-cron-secret': CRON_SECRET } })

            expect(res.status).toBe(200)
            expect(await res.json()).toEqual({ success: true, data: { promoted: 2 } })
        })
    })

    describe('인증', () => {
        test('시크릿이 없으면 401 을 반환한다', async () => {
            const { app, deps } = createApp()
            const res = await app.request('/lifecycle/evict-r2')

            expect(res.status).toBe(401)
            expect(deps.storageLifecycleService.evictR2Stale).not.toHaveBeenCalled()
        })

        test('시크릿이 틀리면 401 을 반환한다', async () => {
            const { app } = createApp()
            const res = await app.request('/lifecycle/evict-r2', { method: 'POST', headers: { Authorization: 'Bearer wrong' } })

            expect(res.status).toBe(401)
        })
    })
})
