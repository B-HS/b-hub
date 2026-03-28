import { describe, expect, test, mock } from 'bun:test'
import { createHnDigestService } from '../../../../service/domain/hn/hn-digest'

const createMockDb = () => ({
    getUnsummarizedStories: mock(() => Promise.resolve([])),
    getCommentsByStoryId: mock(() => Promise.resolve([])),
    saveSummary: mock(() => Promise.resolve()),
    markStorySummarized: mock(() => Promise.resolve()),
    getSummaryByStoryId: mock(() => Promise.resolve(null)),
    getRecentSummaries: mock(() => Promise.resolve([])),
    getStoriesByIds: mock(() => Promise.resolve([])),
    upsertDigest: mock(() => Promise.resolve()),
    getStoriesForPeriod: mock(() => Promise.resolve([])),
    getSummariesByStoryIds: mock(() => Promise.resolve([])),
})

const createMockAi = (response = '{"summary": "테스트 요약"}') => ({
    summarize: mock(() => Promise.resolve(response)),
})

const createStory = (id: number, overrides: Record<string, unknown> = {}) => ({
    id,
    title: `Story ${id}`,
    titleKo: `스토리 ${id}`,
    url: `https://example.com/${id}`,
    score: 100,
    descendants: 50,
    storyText: null,
    contentSummary: null,
    tags: ['AI/ML'],
    ...overrides,
})

describe('createHnDigestService', () => {
    describe('summarizeStory', () => {
        test('AI 응답에서 JSON summary를 추출한다', async () => {
            const ai = createMockAi('{"summary": "AI가 생성한 요약"}')
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            const result = await service.summarizeStory(createStory(1), [])
            expect(result.summary).toBe('AI가 생성한 요약')
        })

        test('JSON이 없으면 titleKo로 폴백한다', async () => {
            const ai = createMockAi('이것은 JSON이 아닙니다')
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            const story = createStory(1, { titleKo: 'Korean Title' })
            const result = await service.summarizeStory(story, [])
            expect(result.summary).toBe('Korean Title')
        })

        test('titleKo가 없으면 title로 폴백한다', async () => {
            const ai = createMockAi('not json')
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            const result = await service.summarizeStory(createStory(1, { titleKo: undefined }), [])
            expect(result.summary).toBe('Story 1')
        })

        test('AI 에러 시 titleKo로 폴백한다', async () => {
            const ai = { summarize: mock(() => Promise.reject(new Error('API error'))) }
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            const result = await service.summarizeStory(createStory(1, { titleKo: '폴백 제목' }), [])
            expect(result.summary).toBe('폴백 제목')
        })

        test('depth=0인 댓글만 상위 10개를 포함한다', async () => {
            const ai = createMockAi()
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            const comments = Array.from({ length: 15 }, (_, i) => ({
                depth: i < 12 ? 0 : 1,
                commentText: `Comment ${i}`,
            }))

            await service.summarizeStory(createStory(1), comments)
            const prompt = (ai.summarize as ReturnType<typeof mock>).mock.calls[0][0] as string
            expect(prompt).toContain('Comment 0')
            expect(prompt).toContain('Comment 9')
            expect(prompt).not.toContain('Comment 10')
        })

        test('contentSummary가 있으면 우선 사용한다', async () => {
            const ai = createMockAi()
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            await service.summarizeStory(createStory(1, { contentSummary: '본문 요약', storyText: '원본 텍스트' }), [])
            const prompt = (ai.summarize as ReturnType<typeof mock>).mock.calls[0][0] as string
            expect(prompt).toContain('본문 요약')
        })

        test('tags를 스토리에서 가져온다', async () => {
            const ai = createMockAi('{"summary": "요약"}')
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            const result = await service.summarizeStory(createStory(1, { tags: ['Web', 'Backend'] }), [])
            expect(result.tags).toEqual(['Web', 'Backend'])
        })
    })

    describe('summarizeAndSave', () => {
        test('saveSummary와 markStorySummarized를 호출한다', async () => {
            const ai = createMockAi('{"summary": "요약"}')
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            await service.summarizeAndSave(createStory(42), [], 'daily')
            expect(db.saveSummary).toHaveBeenCalledWith(42, '요약', ['AI/ML'], 'daily')
            expect(db.markStorySummarized).toHaveBeenCalledWith(42)
        })

        test('기본 summaryType은 daily이다', async () => {
            const ai = createMockAi('{"summary": "요약"}')
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            await service.summarizeAndSave(createStory(1), [])
            expect(db.saveSummary).toHaveBeenCalledWith(1, expect.any(String), ['AI/ML'], 'daily')
        })
    })

    describe('generateDigestSummary', () => {
        test('daily 타입 레이블을 올바르게 설정한다', async () => {
            const ai = createMockAi()
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            await service.generateDigestSummary('daily', [])
            const prompt = (ai.summarize as ReturnType<typeof mock>).mock.calls[0][0] as string
            expect(prompt).toContain('일간')
        })

        test('weekly 타입 레이블을 올바르게 설정한다', async () => {
            const ai = createMockAi()
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            await service.generateDigestSummary('weekly', [])
            const prompt = (ai.summarize as ReturnType<typeof mock>).mock.calls[0][0] as string
            expect(prompt).toContain('주간')
        })

        test('monthly 타입 레이블을 올바르게 설정한다', async () => {
            const ai = createMockAi()
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            await service.generateDigestSummary('monthly', [])
            const prompt = (ai.summarize as ReturnType<typeof mock>).mock.calls[0][0] as string
            expect(prompt).toContain('월간')
        })

        test('AI 에러 시 폴백 메시지를 반환한다', async () => {
            const ai = { summarize: mock(() => Promise.reject(new Error('fail'))) }
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            const result = await service.generateDigestSummary('daily', [])
            expect(result).toBe('일간 다이제스트 생성에 실패했습니다.')
        })

        test('titleKo가 있으면 우선 사용한다', async () => {
            const ai = createMockAi()
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            await service.generateDigestSummary('daily', [
                { title: 'English', titleKo: '한국어', summary: '요약', score: 100, tags: [] },
            ])
            const prompt = (ai.summarize as ReturnType<typeof mock>).mock.calls[0][0] as string
            expect(prompt).toContain('한국어')
        })
    })

    describe('runDaily', () => {
        test('미요약 스토리를 요약하고 다이제스트를 생성한다', async () => {
            const ai = createMockAi('{"summary": "요약"}')
            const db = createMockDb()
            db.getUnsummarizedStories = mock(() => Promise.resolve([createStory(1), createStory(2)]))
            db.getCommentsByStoryId = mock(() => Promise.resolve([]))
            db.getRecentSummaries = mock(() => Promise.resolve([{ storyId: 1, summary: '요약1', tags: [] }]))
            db.getStoriesByIds = mock(() => Promise.resolve([createStory(1)]))
            const service = createHnDigestService({ ai, db })

            const result = await service.runDaily()
            expect(result.summarized).toBe(2)
            expect(db.upsertDigest).toHaveBeenCalled()
        })

        test('dateKey 형식이 YYYY-MM-DD이다', async () => {
            const ai = createMockAi('{"summary": "요약"}')
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            const result = await service.runDaily()
            expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        })

        test('미요약 스토리가 없어도 다이제스트를 생성한다', async () => {
            const ai = createMockAi()
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            const result = await service.runDaily()
            expect(result.summarized).toBe(0)
            expect(db.upsertDigest).toHaveBeenCalled()
        })
    })

    describe('runWeekly', () => {
        test('주간 다이제스트를 생성한다', async () => {
            const ai = createMockAi()
            const db = createMockDb()
            db.getStoriesForPeriod = mock(() => Promise.resolve([createStory(1)]))
            db.getSummariesByStoryIds = mock(() => Promise.resolve([{ storyId: 1, summary: '요약', tags: [] }]))
            const service = createHnDigestService({ ai, db })

            const result = await service.runWeekly()
            expect(result.stories).toBe(1)
            expect(db.upsertDigest).toHaveBeenCalled()
        })

        test('weekKey 형식이 YYYY-Wnn이다', async () => {
            const ai = createMockAi()
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            const result = await service.runWeekly()
            expect(result.week).toMatch(/^\d{4}-W\d{2}$/)
        })
    })

    describe('runMonthly', () => {
        test('월간 다이제스트를 생성한다', async () => {
            const ai = createMockAi()
            const db = createMockDb()
            db.getStoriesForPeriod = mock(() => Promise.resolve([createStory(1)]))
            db.getSummariesByStoryIds = mock(() => Promise.resolve([{ storyId: 1, summary: '요약', tags: [] }]))
            const service = createHnDigestService({ ai, db })

            const result = await service.runMonthly()
            expect(result.stories).toBe(1)
            expect(db.upsertDigest).toHaveBeenCalled()
        })

        test('monthKey 형식이 YYYY-MM이다', async () => {
            const ai = createMockAi()
            const db = createMockDb()
            const service = createHnDigestService({ ai, db })

            const result = await service.runMonthly()
            expect(result.month).toMatch(/^\d{4}-\d{2}$/)
        })
    })
})
