import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createStoryRoute } from '../../../route/hn/story'

const mockStories = [
    {
        id: 1,
        type: 'top',
        hnType: 'story',
        title: 'Test Story',
        titleKo: '테스트',
        score: 100,
        time: 1700000000,
    },
]

const createMockDb = () => ({
    getStoriesPaginated: mock(() => Promise.resolve(mockStories)),
    getStoryById: mock((id: number) => Promise.resolve(id === 1 ? mockStories[0] : null)),
    getSummariesByStoryIds: mock(() => Promise.resolve([{ storyId: 1, summary: 'test summary' }])),
    getSummaryByStoryId: mock(() => Promise.resolve({ storyId: 1, summary: 'test summary' })),
    getCommentsByStoryId: mock(() => Promise.resolve([{ id: 100, storyId: 1, commentText: 'comment' }])),
    getAllTags: mock(() => Promise.resolve([{ id: 1, name: 'AI', usageCount: 10 }])),
    getStoriesByTagName: mock(() => Promise.resolve({ stories: mockStories, summaries: [] })),
    searchStories: mock(() => Promise.resolve(mockStories)),
})

const createApp = (db = createMockDb()) => {
    const app = new Hono()
    app.route('/hn', createStoryRoute({ db }))
    return { app, db }
}

describe('GET /hn/stories', () => {
    test('스토리 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/hn/stories')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.stories).toHaveLength(1)
    })

    test('type 필터를 적용한다', async () => {
        const { app, db } = createApp()
        await app.request('/hn/stories?type=top')
        expect(db.getStoriesPaginated).toHaveBeenCalledWith('top', 20, 0)
    })

    test('페이지네이션을 적용한다', async () => {
        const { app, db } = createApp()
        await app.request('/hn/stories?page=2&limit=10')
        expect(db.getStoriesPaginated).toHaveBeenCalledWith(undefined, 10, 10)
    })
})

describe('GET /hn/stories/:id', () => {
    test('스토리 상세를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/hn/stories/1')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.story.id).toBe(1)
        expect(body.data.summary).toBeDefined()
        expect(body.data.comments).toHaveLength(1)
    })

    test('존재하지 않는 스토리는 404를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/hn/stories/999')
        expect(res.status).toBe(404)
    })
})

describe('GET /hn/tags', () => {
    test('태그 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/hn/tags')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.tags).toHaveLength(1)
    })
})

describe('GET /hn/search', () => {
    test('스토리를 검색한다', async () => {
        const { app } = createApp()
        const res = await app.request('/hn/search?q=test')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.stories).toHaveLength(1)
    })

    test('검색어 없으면 에러를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/hn/search')
        expect(res.status).not.toBe(200)
    })
})
