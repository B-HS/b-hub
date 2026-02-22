import { describe, expect, test, mock, afterEach } from 'bun:test'
import { Hono } from 'hono'
import { createCronRoute } from '../../../route/hn/cron'

const mockWebhookResult = { total: 1, success: 1, failed: 0, details: [{ webhookId: 1, name: 'test', status: 'success' as const }] }

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
        runDaily: mock(() => Promise.resolve({ summarized: 5, date: '2025-01-01', content: 'digest content', storySummaries: [] })),
        runWeekly: mock(() => Promise.resolve({ stories: 10, week: '2025-W01', content: 'weekly content', storySummaries: [] })),
        runMonthly: mock(() => Promise.resolve({ stories: 30, month: '2025-01', content: 'monthly content', storySummaries: [] })),
        summarizeStory: mock(() => Promise.resolve({ summary: '', tags: [] })),
        summarizeAndSave: mock(() => Promise.resolve({ summary: '', tags: [] })),
        generateDigestSummary: mock(() => Promise.resolve('')),
    },
    hnWebhook: {
        createDigestPayload: mock((_type: string, _date: string, _content: string, _stories: unknown[]) => ({
            type: 'daily' as const,
            date: '2025-01-01',
            title: 'test',
            content: 'test',
            stories: [],
        })),
        sendDigestWebhook: mock(() => Promise.resolve(mockWebhookResult)),
        register: mock(() => Promise.resolve({ success: true })),
        deactivate: mock(() => Promise.resolve()),
        remove: mock(() => Promise.resolve()),
        removeByUrl: mock(() => Promise.resolve({ deleted: 0 })),
        list: mock(() => Promise.resolve([])),
        test: mock(() => Promise.resolve({ success: true, webhookId: 1, name: 'test' })),
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

describe('GET /cron/weekly', () => {
    test('인증된 요청으로 주간 다이제스트를 생성한다', async () => {
        const { app } = createApp()
        const res = await app.request('/cron/weekly', {
            headers: { Authorization: 'Bearer test-secret' },
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.stories).toBe(10)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/cron/weekly')
        expect(res.status).toBe(401)
    })
})

describe('GET /cron/monthly', () => {
    const OriginalDate = globalThis.Date

    afterEach(() => {
        globalThis.Date = OriginalDate
    })

    const mockDate = (fakeNow: Date) => {
        globalThis.Date = new Proxy(OriginalDate, {
            construct(_target, args) {
                return args.length === 0 ? new OriginalDate(fakeNow.getTime()) : new OriginalDate(...(args as [string]))
            },
            apply(_target, _thisArg, args) {
                return args.length === 0 ? new OriginalDate(fakeNow.getTime()).toString() : new OriginalDate(...(args as [string])).toString()
            },
        }) as DateConstructor
    }

    test('마지막 날이면 월간 다이제스트를 생성한다', async () => {
        mockDate(new OriginalDate(2025, 0, 31, 9, 0, 0))

        const { app } = createApp()
        const res = await app.request('/cron/monthly', {
            headers: { Authorization: 'Bearer test-secret' },
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.stories).toBe(30)
    })

    test('마지막 날이 아니면 skip한다', async () => {
        mockDate(new OriginalDate(2025, 0, 28, 9, 0, 0))

        const { app } = createApp()
        const res = await app.request('/cron/monthly', {
            headers: { Authorization: 'Bearer test-secret' },
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.skipped).toBe(true)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/cron/monthly')
        expect(res.status).toBe(401)
    })
})
