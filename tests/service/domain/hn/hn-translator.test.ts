import { describe, expect, test, mock } from 'bun:test'
import { createHnTranslator } from '../../../../service/domain/hn/hn-translator'

const createMockDeps = (overrides: { summarize?: (...args: unknown[]) => Promise<string>; getExistingTags?: () => Promise<string[]>; updateTagUsage?: (tags: string[]) => Promise<void> } = {}) => ({
    ai: {
        summarize: overrides.summarize ?? mock(() => Promise.resolve('[]')),
    },
    db: {
        getExistingTags: overrides.getExistingTags ?? mock(() => Promise.resolve([])),
        updateTagUsage: overrides.updateTagUsage ?? mock(() => Promise.resolve()),
    },
})

const createStoryInput = (id: number, title = `Story ${id}`) => ({
    id,
    title,
    storyText: null as string | null,
    content: null as string | null,
})

describe('createHnTranslator', () => {
    describe('translateBatch', () => {
        test('빈 입력은 빈 배열을 반환한다', async () => {
            const deps = createMockDeps()
            const translator = createHnTranslator(deps)

            const result = await translator.translateBatch([], [])
            expect(result).toEqual([])
        })

        test('유효한 JSON 응답을 파싱한다', async () => {
            const summarize = mock(() =>
                Promise.resolve(
                    JSON.stringify([
                        { idx: 0, titleKo: '한국어 제목', tags: ['AI/ML', 'Web'] },
                    ]),
                ),
            )
            const deps = createMockDeps({ summarize })
            const translator = createHnTranslator(deps)

            const result = await translator.translateBatch([createStoryInput(1, 'Test Story')], ['AI/ML', 'Web'])
            expect(result).toHaveLength(1)
            expect(result[0].titleKo).toBe('한국어 제목')
            expect(result[0].tags).toEqual(['AI/ML', 'Web'])
        })

        test('tags가 3개를 초과하면 3개로 자른다', async () => {
            const summarize = mock(() =>
                Promise.resolve(
                    JSON.stringify([{ idx: 0, titleKo: '제목', tags: ['A', 'B', 'C', 'D', 'E'] }]),
                ),
            )
            const deps = createMockDeps({ summarize })
            const translator = createHnTranslator(deps)

            const result = await translator.translateBatch([createStoryInput(1)], [])
            expect(result[0].tags).toHaveLength(3)
        })

        test('idx가 범위 밖인 항목은 무시���다', async () => {
            const summarize = mock(() =>
                Promise.resolve(
                    JSON.stringify([
                        { idx: 0, titleKo: '유효' },
                        { idx: 99, titleKo: '범위밖' },
                    ]),
                ),
            )
            const deps = createMockDeps({ summarize })
            const translator = createHnTranslator(deps)

            const result = await translator.translateBatch([createStoryInput(1)], [])
            expect(result).toHaveLength(1)
            expect(result[0].titleKo).toBe('유효')
        })

        test('titleKo가 없으면 원본 title을 사용한다', async () => {
            const summarize = mock(() => Promise.resolve(JSON.stringify([{ idx: 0, tags: ['AI'] }])))
            const deps = createMockDeps({ summarize })
            const translator = createHnTranslator(deps)

            const result = await translator.translateBatch([createStoryInput(1, 'Original Title')], [])
            expect(result[0].titleKo).toBe('Original Title')
        })

        test('잘못된 JSON은 빈 배열을 반환한��', async () => {
            const summarize = mock(() => Promise.resolve('This is not JSON at all'))
            const deps = createMockDeps({ summarize })
            const translator = createHnTranslator(deps)

            const result = await translator.translateBatch([createStoryInput(1)], [])
            expect(result).toEqual([])
        })

        test('JSON 배열이 없는 응답은 빈 배열을 반환한다', async () => {
            const summarize = mock(() => Promise.resolve('{"key": "value"}'))
            const deps = createMockDeps({ summarize })
            const translator = createHnTranslator(deps)

            const result = await translator.translateBatch([createStoryInput(1)], [])
            expect(result).toEqual([])
        })

        test('storyText와 content를 포함하여 전송한다', async () => {
            const summarize = mock(() => Promise.resolve(JSON.stringify([{ idx: 0, titleKo: '제목', contentSummary: 'Summary', contentSummaryKo: '요약' }])))
            const deps = createMockDeps({ summarize })
            const translator = createHnTranslator(deps)

            const story = { ...createStoryInput(1), storyText: 'Story text here', content: 'Full content here' }
            const result = await translator.translateBatch([story], [])
            expect(result[0].contentSummary).toBe('Summary')
            expect(result[0].contentSummaryKo).toBe('요약')
        })
    })

    describe('translateBatchWithRetry', () => {
        test('503이 아닌 에러는 재시도하지 않고 원본 title로 폴백한다', async () => {
            const summarize = mock(() => Promise.reject(new Error('400 Bad Request')))
            const deps = createMockDeps({ summarize })
            const translator = createHnTranslator(deps)

            const result = await translator.translateBatch([createStoryInput(1, 'Fallback Title')], [])
            expect(result).toHaveLength(1)
            expect(result[0].titleKo).toBe('Fallback Title')
            expect(result[0].tags).toEqual([])
        })

        test('UNAVAILABLE 에러도 재시도 대상으로 판별한다', async () => {
            const errorMsg = 'UNAVAILABLE'
            expect(errorMsg.includes('UNAVAILABLE')).toBe(true)
        })
    })

    describe('getExistingTags', () => {
        test('DB 태그와 DEFAULT_TAGS를 합치고 중복을 제거한다', async () => {
            const getExistingTags = mock(() => Promise.resolve(['AI/ML', 'CustomTag']))
            const deps = createMockDeps({ getExistingTags })
            const translator = createHnTranslator(deps)

            const tags = await translator.getExistingTags()
            const aiCount = tags.filter((t) => t === 'AI/ML').length
            expect(aiCount).toBe(1)
            expect(tags).toContain('CustomTag')
            expect(tags).toContain('Web')
            expect(tags).toContain('Backend')
        })
    })

    describe('updateTagUsage', () => {
        test('db.updateTagUsage를 호출한다', async () => {
            const updateTagUsage = mock(() => Promise.resolve())
            const deps = createMockDeps({ updateTagUsage })
            const translator = createHnTranslator(deps)

            await translator.updateTagUsage(['AI/ML', 'Web'])
            expect(updateTagUsage).toHaveBeenCalledWith(['AI/ML', 'Web'])
        })
    })
})
