import { describe, expect, test, mock } from 'bun:test'
import { createAiChatService } from '../../../../service/domain/ai/ai-chat'
import type { AiUsageLogger, AiChatStreamEvent, AiMessagePairInsert } from '../../../../service/domain/ai/ai-chat'
import type { AiCompletionRequest, AiStreamEvent } from '../../../../service/domain/ai/ai-provider'
import { createAppError } from '../../../../lib/error'
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

const upstreamOf = (events: AiStreamEvent[]) =>
    (async function* () {
        for (const event of events) yield event
    })()

const defaultUpstream = () =>
    upstreamOf([
        { type: 'delta', text: 'ans' },
        { type: 'delta', text: 'wer' },
        { type: 'done', result: { content: 'answer', modelId: 'claude-x', inputTokens: 10, outputTokens: 20 } },
    ])

const collect = async (events: AsyncIterable<AiChatStreamEvent>) => {
    const collected: AiChatStreamEvent[] = []
    for await (const event of events) collected.push(event)
    return collected
}

const createDeps = () => {
    const client = {
        complete: mock(async (_req: AiCompletionRequest) => ({ content: 'answer', modelId: 'claude-x', inputTokens: 10, outputTokens: 20 })),
        completeStream: mock(async (_req: AiCompletionRequest) => defaultUpstream()),
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
    const insertMessagePair = mock(async (_pair: AiMessagePairInsert) => ({ userMessageId: 99, assistantMessageId: 100 }))
    const logUsage = mock((_entry: Parameters<AiUsageLogger>[0]) => {})
    return { client, connectionService, promptService, sessionService, attachmentService, insertMessagePair, logUsage }
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

            const pair = deps.insertMessagePair.mock.calls[0][0]
            expect(deps.insertMessagePair).toHaveBeenCalledTimes(1)
            expect(pair.sessionId).toBe('sess-1')
            expect(pair.user).toEqual({ content: 'hello world' })
            expect(pair.assistant).toMatchObject({ content: 'answer', modelId: 'claude-x', inputTokens: 10, outputTokens: 20 })
            expect(pair.assistant.durationMs).toEqual(expect.any(Number))

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

        test('context가 주어지면 프롬프트 systemText 뒤에 병합한다', async () => {
            const deps = createDeps()
            const service = createAiChatService(deps as never)

            await service.send('user-1', 'sess-1', { content: 'hello world', context: '<MAIL_CONTEXT>mail body</MAIL_CONTEXT>' })

            const req = deps.client.complete.mock.calls[0][0]
            expect(req.system).toBe('You are helpful\n\n<MAIL_CONTEXT>mail body</MAIL_CONTEXT>')
        })

        test('프롬프트 systemText가 없고 context만 있으면 context가 system이 된다', async () => {
            const deps = createDeps()
            deps.promptService.resolveOwned = mock(async (_userId: string, _ids: number[]) => [])
            const service = createAiChatService(deps as never)

            await service.send('user-1', 'sess-1', { content: 'q', context: 'CTX' })

            const req = deps.client.complete.mock.calls[0][0]
            expect(req.system).toBe('CTX')
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
            expect(deps.insertMessagePair).not.toHaveBeenCalled()
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

    describe('sendStream', () => {
        test('델타를 그대로 방출하고 done 에서 유저·어시스턴트 메시지를 저장한다', async () => {
            const deps = createDeps()
            const service = createAiChatService(deps as never)

            const events = await collect(await service.sendStream('user-1', 'sess-1', { content: 'hello world' }))

            expect(events[0]).toEqual({ type: 'delta', text: 'ans' })
            expect(events[1]).toEqual({ type: 'delta', text: 'wer' })
            expect(events[2]).toMatchObject({
                type: 'done',
                result: { id: 100, content: 'answer', modelId: 'claude-x', inputTokens: 10, outputTokens: 20 },
            })
            expect((events[2] as { result: { durationMs: number } }).result.durationMs).toEqual(expect.any(Number))

            const pair = deps.insertMessagePair.mock.calls[0][0]
            expect(pair.user).toEqual({ content: 'hello world' })
            expect(pair.assistant).toMatchObject({ content: 'answer', inputTokens: 10, outputTokens: 20 })

            expect(deps.sessionService.touchLastMessage).toHaveBeenCalledWith('sess-1')
            expect(deps.connectionService.touchUsed).toHaveBeenCalledWith(5)
            const logged = deps.logUsage.mock.calls[0][0]
            expect(logged.severity).toBe(20)
            expect(logged.errorCode).toBe('AI_CHAT_COMPLETED')
        })

        test('스트림 연결이 실패하면 reject 하고 logUsage(severity 40)를 남긴다', async () => {
            const deps = createDeps()
            deps.client.completeStream = mock((_req: AiCompletionRequest) => Promise.reject(new Error('provider down')))
            const service = createAiChatService(deps as never)

            await expect(service.sendStream('user-1', 'sess-1', { content: 'hello world' })).rejects.toThrow('provider down')

            const logged = deps.logUsage.mock.calls[0][0]
            expect(logged.severity).toBe(40)
            expect(logged.errorCode).toBe('AI_CHAT_FAILED')
            expect(deps.insertMessagePair).not.toHaveBeenCalled()
        })

        test('스트림 중간 실패면 메시지를 저장하지 않고 logUsage(severity 40) 후 throw 한다(고아 방지)', async () => {
            const deps = createDeps()
            deps.client.completeStream = mock(async (_req: AiCompletionRequest) =>
                (async function* (): AsyncGenerator<AiStreamEvent> {
                    yield { type: 'delta', text: 'par' }
                    throw createAppError('AI_PROVIDER_ERROR')
                })(),
            )
            const service = createAiChatService(deps as never)

            const events = await service.sendStream('user-1', 'sess-1', { content: 'hello world' })
            await expect(collect(events)).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' })

            expect(deps.insertMessagePair).not.toHaveBeenCalled()
            expect(deps.sessionService.touchLastMessage).not.toHaveBeenCalled()
            const logged = deps.logUsage.mock.calls[0][0]
            expect(logged.severity).toBe(40)
            expect(logged.errorCode).toBe('AI_CHAT_FAILED')
        })

        test('done 없이 스트림이 끝나면 AI_COMPLETION_FAILED를 던지고 저장하지 않는다', async () => {
            const deps = createDeps()
            deps.client.completeStream = mock(async (_req: AiCompletionRequest) => upstreamOf([{ type: 'delta', text: 'par' }]))
            const service = createAiChatService(deps as never)

            const events = await service.sendStream('user-1', 'sess-1', { content: 'hello world' })
            await expect(collect(events)).rejects.toMatchObject({ code: 'AI_COMPLETION_FAILED' })
            expect(deps.insertMessagePair).not.toHaveBeenCalled()
        })

        test('전달받은 AbortSignal 을 프로바이더 요청에 그대로 넘긴다', async () => {
            const deps = createDeps()
            const service = createAiChatService(deps as never)
            const controller = new AbortController()

            await collect(await service.sendStream('user-1', 'sess-1', { content: 'hello world' }, controller.signal))

            expect(deps.client.completeStream.mock.calls[0][0].signal).toBe(controller.signal)
        })
    })

    describe('completeStream', () => {
        test('전달받은 AbortSignal 을 프로바이더 요청에 그대로 넘긴다', async () => {
            const deps = createDeps()
            const service = createAiChatService(deps as never)
            const controller = new AbortController()

            await collect(
                await service.completeStream(
                    'user-1',
                    { provider: 'anthropic', modelId: 'claude-x', messages: [{ role: 'user', content: 'ping' }] },
                    controller.signal,
                ),
            )

            expect(deps.client.completeStream.mock.calls[0][0].signal).toBe(controller.signal)
        })

        test('델타를 방출하고 done 에서 touchUsed·logUsage(severity 20)만 수행한다(세션 미저장)', async () => {
            const deps = createDeps()
            const service = createAiChatService(deps as never)

            const events = await collect(
                await service.completeStream('user-1', { provider: 'anthropic', modelId: 'claude-x', messages: [{ role: 'user', content: 'ping' }] }),
            )

            expect(events[0]).toEqual({ type: 'delta', text: 'ans' })
            expect(events[2]).toMatchObject({
                type: 'done',
                result: { content: 'answer', modelId: 'claude-x', inputTokens: 10, outputTokens: 20 },
            })
            expect(deps.insertMessagePair).not.toHaveBeenCalled()
            expect(deps.connectionService.touchUsed).toHaveBeenCalledWith(5)
            const logged = deps.logUsage.mock.calls[0][0]
            expect(logged.severity).toBe(20)
            expect(logged.errorCode).toBe('AI_COMPLETION_COMPLETED')
        })

        test('done 을 방출하기 전에는 touchUsed·logUsage 를 수행하지 않는다', async () => {
            const deps = createDeps()
            const service = createAiChatService(deps as never)

            const events = await service.completeStream('user-1', {
                provider: 'anthropic',
                modelId: 'claude-x',
                messages: [{ role: 'user', content: 'ping' }],
            })
            await events.next()
            expect(deps.connectionService.touchUsed).not.toHaveBeenCalled()
            expect(deps.logUsage).not.toHaveBeenCalled()
        })

        test('스트림 연결이 실패하면 reject 하고 logUsage(severity 40)를 남긴다', async () => {
            const deps = createDeps()
            deps.client.completeStream = mock((_req: AiCompletionRequest) => Promise.reject(new Error('provider down')))
            const service = createAiChatService(deps as never)

            await expect(
                service.completeStream('user-1', { provider: 'anthropic', modelId: 'claude-x', messages: [{ role: 'user', content: 'ping' }] }),
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
            expect(deps.insertMessagePair).not.toHaveBeenCalled()
        })

        test('user/assistant 메시지를 단일 트랜잭션 호출로 함께 저장한다', async () => {
            const deps = createDeps()
            const service = createAiChatService(deps as never)

            const result = await service.send('user-1', 'sess-1', { content: 'hello world', attachmentIds: [7] })

            expect(deps.insertMessagePair).toHaveBeenCalledTimes(1)
            expect(deps.sessionService.insertMessage).not.toHaveBeenCalled()
            expect(deps.attachmentService.attachToMessage).toHaveBeenCalledWith('user-1', [7], 99)
            expect(result.id).toBe(100)
        })

        test('메시지 쌍 저장이 실패하면 touchLastMessage 없이 throw 한다(고아 방지)', async () => {
            const deps = createDeps()
            deps.insertMessagePair = mock((_pair: AiMessagePairInsert) => Promise.reject(new Error('tx fail')))
            const service = createAiChatService(deps as never)

            await expect(service.send('user-1', 'sess-1', { content: 'hello world' })).rejects.toThrow('tx fail')
            expect(deps.sessionService.touchLastMessage).not.toHaveBeenCalled()
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
