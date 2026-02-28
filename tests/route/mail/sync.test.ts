import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createMailSyncRoute } from '../../../route/mail/sync'

const createMockDeps = () => ({
    mailSyncService: {
        syncAccount: mock(() => Promise.resolve({ added: 5, updated: 2, deleted: 1, durationMs: 1000 })),
        syncHistorical: mock(() => Promise.resolve({
            synced: 10,
            totalEstimate: 100,
            syncedSoFar: 60,
            cursor: 'next-page',
            hasMore: true,
            folderId: 1,
            sessionId: 1,
        })),
        getSyncStatus: mock(() => Promise.resolve({
            accountId: 1,
            lastSyncAt: new Date().toISOString(),
            lastSyncStatus: 'success',
            historicalSync: null,
            latestLog: null,
        })),
    },
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'user', image: null } })),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/mail/sync', createMailSyncRoute(deps))
    return { app, deps }
}

describe('POST /mail/sync', () => {
    test('동기화 결과를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: 1 }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.added).toBe(5)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/mail/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: 1 }),
        })
        expect(res.status).toBe(401)
    })

    test('잘못된 요청은 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        })
        expect(res.status).toBe(400)
    })
})

describe('POST /mail/sync/historical', () => {
    test('배치 동기화 결과를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/sync/historical', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: 1, batchSize: 50 }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.hasMore).toBe(true)
    })

    test('잘못된 batchSize는 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/sync/historical', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: 1, batchSize: 5 }),
        })
        expect(res.status).toBe(400)
    })
})

describe('GET /mail/sync/status', () => {
    test('동기화 상태를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/sync/status?accountId=1')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.accountId).toBe(1)
    })

    test('accountId 없으면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/sync/status')
        expect(res.status).toBe(400)
    })
})
