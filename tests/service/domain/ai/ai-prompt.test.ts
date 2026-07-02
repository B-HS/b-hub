import { describe, expect, test, mock } from 'bun:test'
import { createAiPromptService } from '../../../../service/domain/ai/ai-prompt'
import type { AiPromptInsert, AiPromptUpdateData } from '../../../../service/domain/ai/ai-prompt'
import type { AiPrompt } from '../../../../db/schema'

const buildPrompt = (over: Partial<AiPrompt> = {}): AiPrompt => ({
    id: 1,
    userId: 'user-1',
    name: '요약 프롬프트',
    description: null,
    stage: 'system',
    content: 'You are helpful',
    featureKey: null,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
})

const createMockDb = () => ({
    listByUser: mock(async (_userId: string, _filter: { featureKey?: string; stage?: string }) => [buildPrompt()]),
    getById: mock(async (id: number) => buildPrompt({ id })),
    getByIds: mock(async (ids: number[]) => ids.map((id) => buildPrompt({ id }))),
    insert: mock(async (_data: AiPromptInsert) => ({ id: 2 })),
    update: mock(async (_id: number, _data: AiPromptUpdateData) => {}),
    remove: mock(async (_id: number) => {}),
})

describe('createAiPromptService', () => {
    test('list는 db.listByUser 결과를 반환한다', async () => {
        const db = createMockDb()
        const service = createAiPromptService({ db: db as never })

        const result = await service.list('user-1', { featureKey: 'chat' })
        expect(result).toHaveLength(1)
        expect(db.listByUser).toHaveBeenCalledWith('user-1', { featureKey: 'chat' })
    })

    test('create는 매핑된 인자로 insert를 호출하고 소유 row를 반환한다', async () => {
        const db = createMockDb()
        const service = createAiPromptService({ db: db as never })

        const result = await service.create('user-1', {
            name: '요약 프롬프트',
            stage: 'system',
            content: 'You are helpful',
            sortOrder: 0,
            isActive: true,
        })

        expect(db.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 'user-1',
                name: '요약 프롬프트',
                description: null,
                stage: 'system',
                content: 'You are helpful',
                featureKey: null,
                sortOrder: 0,
                isActive: true,
            }),
        )
        expect(result.id).toBe(2)
    })

    test('getOwned는 타 유저 row에 AI_PROMPT_NOT_FOUND를 throw한다', async () => {
        const db = createMockDb()
        db.getById = mock(async (id: number) => buildPrompt({ id, userId: 'other' }))
        const service = createAiPromptService({ db: db as never })

        await expect(service.getOwned('user-1', 1)).rejects.toMatchObject({ code: 'AI_PROMPT_NOT_FOUND' })
    })

    test('getOwned는 없는 row에 AI_PROMPT_NOT_FOUND를 throw한다', async () => {
        const db = createMockDb()
        db.getById = mock(async (_id: number) => null)
        const service = createAiPromptService({ db: db as never })

        await expect(service.getOwned('user-1', 999)).rejects.toMatchObject({ code: 'AI_PROMPT_NOT_FOUND' })
    })

    test('resolveOwned는 빈 배열이면 []를 반환한다', async () => {
        const db = createMockDb()
        const service = createAiPromptService({ db: db as never })

        const result = await service.resolveOwned('user-1', [])
        expect(result).toEqual([])
        expect(db.getByIds).not.toHaveBeenCalled()
    })

    test('resolveOwned는 중복 id를 제거해 getByIds를 호출한다', async () => {
        const db = createMockDb()
        const service = createAiPromptService({ db: db as never })

        await service.resolveOwned('user-1', [1, 1, 2])
        expect(db.getByIds).toHaveBeenCalledWith([1, 2])
    })

    test('resolveOwned는 타 유저 row가 섞이면 throw한다', async () => {
        const db = createMockDb()
        db.getByIds = mock(async (ids: number[]) => ids.map((id) => buildPrompt({ id, userId: id === 2 ? 'other' : 'user-1' })))
        const service = createAiPromptService({ db: db as never })

        await expect(service.resolveOwned('user-1', [1, 2])).rejects.toMatchObject({ code: 'AI_PROMPT_NOT_FOUND' })
    })

    test('update는 소유 검증 후 db.update를 호출한다', async () => {
        const db = createMockDb()
        const service = createAiPromptService({ db: db as never })

        await service.update('user-1', 1, { name: '수정' })
        expect(db.update).toHaveBeenCalledWith(1, { name: '수정' })
    })

    test('update는 타 유저 row에 throw한다', async () => {
        const db = createMockDb()
        db.getById = mock(async (id: number) => buildPrompt({ id, userId: 'other' }))
        const service = createAiPromptService({ db: db as never })

        await expect(service.update('user-1', 1, { name: '해킹' })).rejects.toMatchObject({ code: 'AI_PROMPT_NOT_FOUND' })
        expect(db.update).not.toHaveBeenCalled()
    })

    test('remove는 소유 검증 후 db.remove를 호출한다', async () => {
        const db = createMockDb()
        const service = createAiPromptService({ db: db as never })

        await service.remove('user-1', 1)
        expect(db.remove).toHaveBeenCalledWith(1)
    })

    test('remove는 타 유저 row에 throw한다', async () => {
        const db = createMockDb()
        db.getById = mock(async (id: number) => buildPrompt({ id, userId: 'other' }))
        const service = createAiPromptService({ db: db as never })

        await expect(service.remove('user-1', 1)).rejects.toMatchObject({ code: 'AI_PROMPT_NOT_FOUND' })
        expect(db.remove).not.toHaveBeenCalled()
    })
})
