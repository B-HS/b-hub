import { describe, expect, test, mock } from 'bun:test'
import { createAiSessionService } from '../../../../service/domain/ai/ai-session'
import type { AiSessionInsert, AiSessionUpdateData, AiMessageInsert } from '../../../../service/domain/ai/ai-session'
import type { AiSession, AiMessage } from '../../../../db/schema'

const buildSession = (over: Partial<AiSession> = {}): AiSession => ({
    id: 'sess-1',
    userId: 'user-1',
    providerId: 42,
    provider: 'anthropic',
    modelId: 'claude-x',
    title: null,
    featureKey: null,
    promptIds: null,
    lastMessageAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
})

const buildMessage = (over: Partial<AiMessage> = {}): AiMessage => ({
    id: 10,
    sessionId: 'sess-1',
    role: 'user',
    content: '안녕',
    modelId: null,
    inputTokens: null,
    outputTokens: null,
    durationMs: null,
    createdAt: new Date(),
    ...over,
})

const createMockDb = () => ({
    listByUser: mock(async (_userId: string, _filter: { page: number; limit: number }) => ({ rows: [buildSession()], total: 1 })),
    getById: mock(async (id: string) => buildSession({ id })),
    insert: mock(async (_data: AiSessionInsert) => {}),
    update: mock(async (_id: string, _data: AiSessionUpdateData) => {}),
    remove: mock(async (_id: string) => {}),
    touchLastMessage: mock(async (_id: string) => {}),
    listMessages: mock(async (_sessionId: string, _filter: { page: number; limit: number }) => ({ rows: [buildMessage()], total: 1 })),
    listRecentMessages: mock(async (_sessionId: string, _limit: number) => [buildMessage()]),
    insertMessage: mock(async (_data: AiMessageInsert) => ({ id: 99 })),
})

describe('createAiSessionService', () => {
    test('create는 generateId로 만든 id와 providerId로 insert를 호출한다', async () => {
        const db = createMockDb()
        const generateId = mock(() => 'gen-1')
        const service = createAiSessionService({ db: db as never, generateId })

        await service.create('user-1', { provider: 'anthropic', modelId: 'claude-x' }, 42)

        expect(generateId).toHaveBeenCalled()
        expect(db.insert).toHaveBeenCalledWith({
            id: 'gen-1',
            userId: 'user-1',
            providerId: 42,
            provider: 'anthropic',
            modelId: 'claude-x',
            title: null,
            featureKey: null,
            promptIds: null,
        })
    })

    test('getOwned는 타 유저 세션에 AI_SESSION_NOT_FOUND를 throw한다', async () => {
        const db = createMockDb()
        db.getById = mock(async (id: string) => buildSession({ id, userId: 'other' }))
        const service = createAiSessionService({ db: db as never, generateId: () => 'gen-1' })

        await expect(service.getOwned('user-1', 'sess-1')).rejects.toMatchObject({ code: 'AI_SESSION_NOT_FOUND' })
    })

    test('getOwned는 없는 세션에 AI_SESSION_NOT_FOUND를 throw한다', async () => {
        const db = createMockDb()
        db.getById = mock(async (_id: string) => null)
        const service = createAiSessionService({ db: db as never, generateId: () => 'gen-1' })

        await expect(service.getOwned('user-1', 'nope')).rejects.toMatchObject({ code: 'AI_SESSION_NOT_FOUND' })
    })

    test('update는 소유 검증 후 db.update를 호출한다', async () => {
        const db = createMockDb()
        const service = createAiSessionService({ db: db as never, generateId: () => 'gen-1' })

        await service.update('user-1', 'sess-1', { title: '제목' })
        expect(db.update).toHaveBeenCalledWith('sess-1', { title: '제목' })
    })

    test('update는 타 유저 세션에 throw하고 db.update를 호출하지 않는다', async () => {
        const db = createMockDb()
        db.getById = mock(async (id: string) => buildSession({ id, userId: 'other' }))
        const service = createAiSessionService({ db: db as never, generateId: () => 'gen-1' })

        await expect(service.update('user-1', 'sess-1', { title: '해킹' })).rejects.toMatchObject({ code: 'AI_SESSION_NOT_FOUND' })
        expect(db.update).not.toHaveBeenCalled()
    })

    test('remove는 소유 검증 후 db.remove를 호출한다', async () => {
        const db = createMockDb()
        const service = createAiSessionService({ db: db as never, generateId: () => 'gen-1' })

        await service.remove('user-1', 'sess-1')
        expect(db.remove).toHaveBeenCalledWith('sess-1')
    })

    test('listMessages는 소유 검증 후 db.listMessages에 위임한다', async () => {
        const db = createMockDb()
        const service = createAiSessionService({ db: db as never, generateId: () => 'gen-1' })

        const result = await service.listMessages('user-1', 'sess-1', { page: 1, limit: 50 })
        expect(result.total).toBe(1)
        expect(db.listMessages).toHaveBeenCalledWith('sess-1', { page: 1, limit: 50 })
    })

    test('listMessages는 타 유저 세션에 throw하고 db.listMessages를 호출하지 않는다', async () => {
        const db = createMockDb()
        db.getById = mock(async (id: string) => buildSession({ id, userId: 'other' }))
        const service = createAiSessionService({ db: db as never, generateId: () => 'gen-1' })

        await expect(service.listMessages('user-1', 'sess-1', { page: 1, limit: 50 })).rejects.toMatchObject({ code: 'AI_SESSION_NOT_FOUND' })
        expect(db.listMessages).not.toHaveBeenCalled()
    })

    test('listRecentMessages/insertMessage/touchLastMessage는 db에 직접 위임한다', async () => {
        const db = createMockDb()
        const service = createAiSessionService({ db: db as never, generateId: () => 'gen-1' })

        const recent = await service.listRecentMessages('sess-1', 50)
        expect(recent).toHaveLength(1)
        expect(db.listRecentMessages).toHaveBeenCalledWith('sess-1', 50)

        const inserted = await service.insertMessage({
            sessionId: 'sess-1',
            role: 'user',
            content: '안녕',
            modelId: null,
            inputTokens: null,
            outputTokens: null,
            durationMs: null,
        })
        expect(inserted.id).toBe(99)
        expect(db.insertMessage).toHaveBeenCalled()

        await service.touchLastMessage('sess-1')
        expect(db.touchLastMessage).toHaveBeenCalledWith('sess-1')
    })
})
