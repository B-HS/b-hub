import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createCronRoute } from '../../../route/hn/cron'

const createMockDeps = (cronSecret = 'test-secret') => ({
    cronSecret,
    hnFetcher: {
        syncAllTypes: mock(() =>
            Promise.resolve({
                top: { synced: 5, updated: 2, parsed: 3 },
                best: { synced: 3, updated: 1, parsed: 2 },
                new: { synced: 10, updated: 5, parsed: 4 },
            }),
        ),
        fetchStoryIds: mock(() => Promise.resolve([])),
        fetchItem: mock(() => Promise.resolve(null)),
        fetchItemsBatch: mock(() => Promise.resolve([])),
        fetchCommentsRecursive: mock(() => Promise.resolve([])),
        syncStories: mock(() => Promise.resolve({ synced: 0, updated: 0, parsed: 0 })),
    },
    hnDigest: {
        runDaily: mock(() => Promise.resolve({ summarized: 5, date: '2025-01-01' })),
        summarizeStory: mock(() => Promise.resolve({ summary: '', tags: [] })),
        summarizeAndSave: mock(() => Promise.resolve({ summary: '', tags: [] })),
        generateDigestSummary: mock(() => Promise.resolve('')),
    },
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/cron', createCronRoute(deps))
    return { app, deps }
}

describe('GET /cron/sync', () => {
    test('인증된 요청으로 동기화한다', async () => {
        const { app } = createApp()
        const res = await app.request('/cron/sync', {
            headers: { Authorization: 'Bearer test-secret' },
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.synced.top.synced).toBe(5)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/cron/sync')
        expect(res.status).toBe(401)
    })

    test('잘못된 시크릿이면 401을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/cron/sync', {
            headers: { Authorization: 'Bearer wrong-secret' },
        })
        expect(res.status).toBe(401)
    })

    test('빈 cronSecret이면 모든 요청을 거부한다', async () => {
        const { app } = createApp(createMockDeps(''))
        const res = await app.request('/cron/sync', {
            headers: { Authorization: 'Bearer ' },
        })
        expect(res.status).toBe(401)
    })

    test('cronSecret 미설정 시 인증 헤더 있어도 거부한다', async () => {
        const { app } = createApp(createMockDeps(''))
        const res = await app.request('/cron/sync', {
            headers: { Authorization: 'Bearer some-secret' },
        })
        expect(res.status).toBe(401)
    })
})

describe('GET /cron/daily', () => {
    test('인증된 요청으로 일간 다이제스트를 생성한다', async () => {
        const { app } = createApp()
        const res = await app.request('/cron/daily', {
            headers: { Authorization: 'Bearer test-secret' },
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.summarized).toBe(5)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/cron/daily')
        expect(res.status).toBe(401)
    })
})
