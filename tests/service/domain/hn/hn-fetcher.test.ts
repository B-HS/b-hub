import { describe, expect, test, mock } from 'bun:test'
import { createHnFetcherService } from '../../../../service/domain/hn/hn-fetcher'

const createMockDb = () => ({
    getExistingStoryIds: mock(() => Promise.resolve([])),
    upsertStory: mock(() => Promise.resolve()),
    updateStoryMeta: mock(() => Promise.resolve()),
    deleteCommentsByStoryId: mock(() => Promise.resolve()),
    insertCommentsBatch: mock(() => Promise.resolve()),
    getUnsummarizedStories: mock(() => Promise.resolve([])),
    getStoriesForPeriod: mock(() => Promise.resolve([])),
    markStorySummarized: mock(() => Promise.resolve()),
    getCommentsByStoryId: mock(() => Promise.resolve([])),
    getStoriesPaginated: mock(() => Promise.resolve([])),
    getStoryById: mock(() => Promise.resolve(null)),
    searchStories: mock(() => Promise.resolve([])),
    getSummariesByStoryIds: mock(() => Promise.resolve([])),
    getSummaryByStoryId: mock(() => Promise.resolve(null)),
    getAllTags: mock(() => Promise.resolve([])),
    getStoriesByTagName: mock(() => Promise.resolve({ stories: [], summaries: [] })),
})

describe('createHnFetcherService', () => {
    test('fetchStoryIds는 스토리 ID 배열을 반환한다', async () => {
        const fetchFn = mock(() =>
            Promise.resolve({
                json: () => Promise.resolve([1, 2, 3, 4, 5]),
            } as Response),
        )
        const service = createHnFetcherService({ fetchFn, db: createMockDb() })

        const ids = await service.fetchStoryIds('top')
        expect(ids).toEqual([1, 2, 3, 4, 5])
    })

    test('fetchItem는 아이템을 반환한다', async () => {
        const item = { id: 1, type: 'story', title: 'Test', score: 100 }
        const fetchFn = mock(() =>
            Promise.resolve({
                json: () => Promise.resolve(item),
            } as Response),
        )
        const service = createHnFetcherService({ fetchFn, db: createMockDb() })

        const result = await service.fetchItem(1)
        expect(result).toEqual(item)
    })

    test('fetchItem은 에러 시 null을 반환한다', async () => {
        const fetchFn = mock(() => Promise.reject(new Error('Network error')))
        const service = createHnFetcherService({ fetchFn, db: createMockDb() })

        const result = await service.fetchItem(1)
        expect(result).toBeNull()
    })

    test('fetchItemsBatch는 배치로 아이템을 가져온다', async () => {
        let callCount = 0
        const fetchFn = mock(() => {
            callCount++
            return Promise.resolve({
                json: () =>
                    Promise.resolve({
                        id: callCount,
                        type: 'story',
                        title: `Story ${callCount}`,
                    }),
            } as Response)
        })
        const service = createHnFetcherService({ fetchFn, db: createMockDb() })

        const results = await service.fetchItemsBatch([1, 2, 3])
        expect(results).toHaveLength(3)
    })

    test('fetchCommentsRecursive는 댓글을 재귀적으로 가져온다', async () => {
        const fetchFn = mock(() =>
            Promise.resolve({
                json: () =>
                    Promise.resolve({
                        id: 100,
                        type: 'comment',
                        by: 'user',
                        text: 'Comment',
                        parent: 1,
                    }),
            } as Response),
        )
        const service = createHnFetcherService({ fetchFn, db: createMockDb() })

        const comments = await service.fetchCommentsRecursive(1, [100], 0, 2)
        expect(comments).toHaveLength(1)
        expect(comments[0].storyId).toBe(1)
    })

    test('fetchCommentsRecursive는 maxDepth에서 멈춘다', async () => {
        const service = createHnFetcherService({
            fetchFn: mock(() => Promise.resolve({} as Response)),
            db: createMockDb(),
        })

        const comments = await service.fetchCommentsRecursive(1, [100], 5, 5)
        expect(comments).toHaveLength(0)
    })

    test('syncAllTypes는 3개 타입을 동기화한다', async () => {
        const fetchFn = mock(() =>
            Promise.resolve({
                json: () => Promise.resolve([]),
            } as Response),
        )
        const service = createHnFetcherService({ fetchFn, db: createMockDb() })

        const result = await service.syncAllTypes()
        expect(result.top).toBeDefined()
        expect(result.best).toBeDefined()
        expect(result.new).toBeDefined()
    })

    test('syncStories에서 모든 아이템이 null이면 빈 결과를 반환한다', async () => {
        let callCount = 0
        const fetchFn = mock(() => {
            callCount++
            if (callCount === 1) {
                return Promise.resolve({
                    json: () => Promise.resolve([1, 2, 3]),
                } as Response)
            }
            return Promise.reject(new Error('Failed'))
        })
        const db = createMockDb()
        db.getExistingStoryIds = mock(() => Promise.resolve([]))
        const service = createHnFetcherService({ fetchFn, db })

        const result = await service.syncStories('top', 3)
        expect(result.synced).toBe(0)
        expect(result.updated).toBe(0)
    })

    test('fetchCommentsRecursive에서 depth가 maxDepth에 도달하면 재귀를 중단한다', async () => {
        const fetchFn = mock(() =>
            Promise.resolve({
                json: () =>
                    Promise.resolve({
                        id: 200,
                        type: 'comment',
                        by: 'user',
                        text: 'Deep comment',
                        parent: 100,
                        kids: [300],
                    }),
            } as Response),
        )
        const service = createHnFetcherService({ fetchFn, db: createMockDb() })

        const comments = await service.fetchCommentsRecursive(1, [200], 3, 3)
        expect(comments).toHaveLength(0)
    })
})
