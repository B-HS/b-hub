import { describe, expect, test, mock } from 'bun:test'
import { createAiChatService } from '../../../../service/domain/ai/ai-chat'
import type { AiUsageLogger } from '../../../../service/domain/ai/ai-chat'
import type { AiCompletionRequest } from '../../../../service/domain/ai/ai-provider'
import type { AiSession, AiMessage, AiPrompt } from '../../../../db/schema'

const buildSession = (over: Partial<AiSession> = {}): AiSession => ({
    id: 'sess-1',
    userId: 'user-1',
    providerId: 5,
    provider: 'anthropic',
    modelId: 'claude-x',
    title: null,
    featureKey: 'chat',
    promptIds: [1],
    lastMessageAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
})

const buildPrompt = (over: Partial<AiPrompt>): AiPrompt => ({
    id: 1,
    userId: 'user-1',
    name: 'p',
    description: null,
    stage: 'system',
    content: '',
    featureKey: null,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
})

const buildMessage = (over: Partial<AiMessage>): AiMessage => ({
    id: 10,
    sessionId: 'sess-1',
    role: 'user',
    content: '',
    modelId: null,
    inputTokens: null,
    outputTokens: null,
    durationMs: null,
    createdAt: new Date(),
    ...over,
})

const createDeps = () => {
    const client = {
        complete: mock(async (_req: AiCompletionRequest) => ({ content: 'answer', modelId: 'claude-x', inputTokens: 10, outputTokens: 20 })),
        listModels: mock(async () => []),
        verify: mock(async () => ({ ok: true })),
    }
    const row = { id: 5 }
    const connectionService = {
        getOwned: mock(async () => buildSession()),
        resolveClient: mock(async (_userId: string, _provider: string) => ({ row, client })),
        touchUsed: mock(async (_id: number) => {}),
    }
    const promptService = {
        resolveOwned: mock(async (_userId: string, _ids: number[]) => [
            buildPrompt({ stage: 'system', content: 'You are helpful', sortOrder: 0 }),
            buildPrompt({ id: 2, stage: 'user', content: 'seed', sortOrder: 1 }),
        ]),
    }
    const sessionService = {
        getOwned: mock(async (_userId: string, _id: string) => buildSession()),
        listRecentMessages: mock(async (_sessionId: string, _limit: number) => [
            buildMessage({ role: 'user', content: 'hi' }),
            buildMessage({ id: 11, role: 'assistant', content: 'hello' }),
        ]),
        insertMessage: mock(async (_data: { role: string; content: string }) => ({ id: 100 })),
        touchLastMessage: mock(async (_id: string) => {}),
    }
    const attachmentService = {
        resolveImages: mock(async (_userId: string, _ids: number[]) => []),
        attachToMessage: mock(async (_userId: string, _ids: number[], _messageId: number) => {}),
    }
    const logUsage = mock((_entry: Parameters<AiUsageLogger>[0]) => {})
    return { client, connectionService, promptService, sessionService, attachmentService, logUsage }
}

describe('createAiChatService', () => {
    describe('send', () => {
        test('프롬프트·히스토리·유저 메시지를 조립해 client.complete를 호출한다', async () => {
            const deps = createDeps()
            const service = createAiChatService(deps as never)

            await service.send('user-1', 'sess-1', { content: 'hello world' })

            expect(deps.sessionService.getOwned).toHaveBeenCalledWith('user-1', 'sess-1')
            expect(deps.connectionService.resolveClient).toHaveBeenCalledWith('user-1', 'anthropic')
            expect(deps.promptService.resolveOwned).toHaveBeenCalledWith('user-1', [1])

            const req = deps.client.complete.mock.calls[0][0]
            expect(req.system).toBe('You are helpful')
            expect(req.modelId).toBe('claude-x')
            expect(req.messages).toHaveLength(4)
            expect(req.messages[0]).toEqual({ role: 'user', content: 'seed' })
            expect(req.messages[1]).toEqual({ role: 'user', content: 'hi' })
            expect(req.messages[2]).toEqual({ role: 'assistant', content: 'hello' })
            expect(req.messages[3]).toMatchObject({ role: 'user', content: 'hello world' })
        })

        test('assistant 메시지를 tokens·durationMs와 함께 저장하고 touch·logUsage(severity 20)를 호출한다', async () => {
            const deps = createDeps()
            const service = createAiChatService(deps as never)

            const result = await service.send('user-1', 'sess-1', { content: 'hello world' })

            const assistantInsert = deps.sessionService.insertMessage.mock.calls[1][0]
            expect(assistantInsert).toMatchObject({
                sessionId: 'sess-1',
                role: 'assistant',
                content: 'answer',
                modelId: 'claude-x',
                inputTokens: 10,
                outputTokens: 20,
            })
            expect(assistantInsert.durationMs).toEqual(expect.any(Number))

            expect(deps.sessionService.touchLastMessage).toHaveBeenCalledWith('sess-1')
            expect(deps.connectionService.touchUsed).toHaveBeenCalledWith(5)

            const logged = deps.logUsage.mock.calls[0][0]
            expect(logged.severity).toBe(20)
            expect(logged.errorCode).toBe('AI_CHAT_COMPLETED')
            expect(result.content).toBe('answer')
            expect(result.role).toBe('assistant')
        })

        test('client.complete가 throw하면 logUsage(severity 40) 후 재-throw한다', async () => {
            const deps = createDeps()
            deps.client.complete = mock((_req: AiCompletionRequest) => Promise.reject(new Error('provider down')))
            const service = createAiChatService(deps as never)

            await expect(service.send('user-1', 'sess-1', { content: 'hello world' })).rejects.toThrow('provider down')

            const logged = deps.logUsage.mock.calls[0][0]
            expect(logged.severity).toBe(40)
            expect(logged.errorCode).toBe('AI_CHAT_FAILED')
            expect(deps.sessionService.touchLastMessage).not.toHaveBeenCalled()
        })
    })

    describe('complete', () => {
        test('세션을 저장하지 않고 resolveClient·complete·touchUsed·logUsage(severity 20)만 수행한다', async () => {
            const deps = createDeps()
            const service = createAiChatService(deps as never)

            const result = await service.complete('user-1', {
                provider: 'anthropic',
                modelId: 'claude-x',
                messages: [{ role: 'user', content: 'ping' }],
            })

            expect(deps.connectionService.resolveClient).toHaveBeenCalledWith('user-1', 'anthropic')
            expect(deps.sessionService.insertMessage).not.toHaveBeenCalled()
            expect(deps.sessionService.touchLastMessage).not.toHaveBeenCalled()
            expect(deps.connectionService.touchUsed).toHaveBeenCalledWith(5)

            const logged = deps.logUsage.mock.calls[0][0]
            expect(logged.severity).toBe(20)
            expect(logged.errorCode).toBe('AI_COMPLETION_COMPLETED')
            expect(result.content).toBe('answer')
        })

        test('promptIds가 없으면 resolveOwned를 호출하지 않고 입력 메시지만 전달한다', async () => {
            const deps = createDeps()
            const service = createAiChatService(deps as never)

            await service.complete('user-1', {
                provider: 'anthropic',
                modelId: 'claude-x',
                messages: [{ role: 'user', content: 'ping' }],
            })

            expect(deps.promptService.resolveOwned).not.toHaveBeenCalled()
            const req = deps.client.complete.mock.calls[0][0]
            expect(req.messages).toEqual([{ role: 'user', content: 'ping' }])
        })

        test('client.complete가 throw하면 logUsage(severity 40) 후 재-throw한다', async () => {
            const deps = createDeps()
            deps.client.complete = mock((_req: AiCompletionRequest) => Promise.reject(new Error('provider down')))
            const service = createAiChatService(deps as never)

            await expect(
                service.complete('user-1', { provider: 'anthropic', modelId: 'claude-x', messages: [{ role: 'user', content: 'ping' }] }),
            ).rejects.toThrow('provider down')

            const logged = deps.logUsage.mock.calls[0][0]
            expect(logged.severity).toBe(40)
            expect(logged.errorCode).toBe('AI_COMPLETION_FAILED')
            expect(deps.connectionService.touchUsed).not.toHaveBeenCalled()
        })
    })

    describe('send 견고성', () => {
        test('provider 실패 시 user/assistant 메시지를 저장하지 않는다(고아 방지)', async () => {
            const deps = createDeps()
            deps.client.complete = mock((_req: AiCompletionRequest) => Promise.reject(new Error('provider down')))
            const service = createAiChatService(deps as never)

            await expect(service.send('user-1', 'sess-1', { content: 'hello world' })).rejects.toThrow('provider down')
            expect(deps.sessionService.insertMessage).not.toHaveBeenCalled()
        })

        test('touchLastMessage/touchUsed가 실패해도 send는 성공 응답을 반환한다', async () => {
            const deps = createDeps()
            deps.sessionService.touchLastMessage = mock((_id: string) => Promise.reject(new Error('touch fail')))
            deps.connectionService.touchUsed = mock((_id: number) => Promise.reject(new Error('touch fail')))
            const service = createAiChatService(deps as never)

            const result = await service.send('user-1', 'sess-1', { content: 'hello world' })
            expect(result.content).toBe('answer')
            expect(deps.logUsage.mock.calls[0][0].severity).toBe(20)
        })
    })
})
