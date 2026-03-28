import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createDigestRoute } from '../../../route/hn/digest'

const createMockDb = (overrides: Record<string, unknown> = {}) => ({
    getDigestsByType: mock(() => Promise.resolve([{ id: 1, digestType: 'daily', digestKey: '2024-01-15', title: 'Daily', content: 'Content', storyIds: [1] }])),
    getDigestByTypeAndKey: mock(() =>
        Promise.resolve({ id: 1, digestType: 'daily', digestKey: '2024-01-15', title: 'Daily', content: 'Content', storyIds: [1] }),
    ),
    getStoriesByIds: mock(() => Promise.resolve([{ id: 1, title: 'Story 1' }])),
    getSummariesByStoryIds: mock(() => Promise.resolve([{ storyId: 1, summary: 'Summary 1' }])),
    ...overrides,
})

const createApp = (dbOverrides: Record<string, unknown> = {}) => {
    const app = new Hono()
    const route = createDigestRoute({ db: createMockDb(dbOverrides) })
    app.route('/digests', route)
    return app
}

describe('GET /digests', () => {
    test('다이제스트 목록을 반환한다', async () => {
        const app = createApp()
        const res = await app.request('/digests?type=daily')
        expect(res.status).toBe(200)
        const body = (await res.json()) as { success: boolean; data: { digests: unknown[] } }
        expect(body.success).toBe(true)
        expect(body.data.digests).toBeArray()
    })

    test('limit를 적용한다', async () => {
        const app = createApp()
        const res = await app.request('/digests?type=daily&limit=5')
        expect(res.status).toBe(200)
    })

    test('type이 없으면 400을 반환한다', async () => {
        const app = createApp()
        const res = await app.request('/digests')
        expect(res.status).toBe(400)
    })
})

describe('GET /digests/:type/:key', () => {
    test('다이제스트 상세를 반환한다', async () => {
        const app = createApp()
        const res = await app.request('/digests/daily/2024-01-15')
        expect(res.status).toBe(200)
        const body = (await res.json()) as { success: boolean; data: { digest: unknown; stories: unknown[] } }
        expect(body.success).toBe(true)
        expect(body.data.digest).toBeDefined()
        expect(body.data.stories).toBeArray()
    })

    test('존재하지 않는 다이제스트는 404를 반환한다', async () => {
        const app = createApp({
            getDigestByTypeAndKey: mock(() => Promise.resolve(null)),
        })
        const res = await app.request('/digests/daily/nonexistent')
        expect(res.status).toBe(404)
    })

    test('유효하지 않은 type은 400을 반환한다', async () => {
        const app = createApp()
        const res = await app.request('/digests/yearly/2024')
        expect(res.status).toBe(400)
    })

    test('storyIds가 빈 배열이면 스토리 조회를 건너뛴다', async () => {
        const getStoriesByIds = mock(() => Promise.resolve([]))
        const app = createApp({
            getDigestByTypeAndKey: mock(() =>
                Promise.resolve({ id: 1, digestType: 'daily', digestKey: '2024-01-15', title: 'D', content: 'C', storyIds: [] }),
            ),
            getStoriesByIds,
        })
        const res = await app.request('/digests/daily/2024-01-15')
        expect(res.status).toBe(200)
        expect(getStoriesByIds).not.toHaveBeenCalled()
    })
})
