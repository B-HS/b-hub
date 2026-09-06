import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createAiChatRoute } from '../../../route/ai/chat'
import type { AiChatStreamEvent } from '../../../service/domain/ai/ai-chat'
import { createAppError } from '../../../lib/error'

const sendResult = { id: 10, role: 'assistant' as const, content: '응답입니다', modelId: 'claude', inputTokens: 5, outputTokens: 7, durationMs: 100 }
const completeResult = { content: '완성된 응답', modelId: 'claude', inputTokens: 3, outputTokens: 4 }
const streamDone = { content: '완성', modelId: 'claude', inputTokens: 3, outputTokens: 4, durationMs: 50 }

const streamOf = (events: AiChatStreamEvent[]) =>
    (async function* () {
        for (const event of events) yield event
    })()

const defaultStreamEvents = (): AiChatStreamEvent[] => [
    { type: 'delta', text: '완' },
    { type: 'delta', text: '성' },
    { type: 'done', result: streamDone },
]

const createMockDeps = () => ({
    aiChatService: {
        send: mock(async () => sendResult),
        sendStream: mock(async () =>
            streamOf([
                { type: 'delta', text: '응' },
                { type: 'done', result: { ...streamDone, id: 10 } },
            ]),
        ),
        complete: mock(async () => completeResult),
        completeStream: mock(async () => streamOf(defaultStreamEvents())),
    },
    getSession: mock(async () => ({ user: { id: 'u1', role: null as string | null } })),
})

const createApp = (deps = createMockDeps(), extra: Record<string, unknown> = {}) => {
    const app = new Hono()
    app.route('/chat', createAiChatRoute({ ...deps, ...extra } as unknown as Parameters<typeof createAiChatRoute>[0]))
    return { app, deps }
}

describe('POST /chat/sessions/:sessionId/messages', () => {
    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(async () => null as never)
        const { app } = createApp(deps)
        const res = await app.request('/chat/sessions/s1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: '안녕' }),
        })
        expect(res.status).toBe(401)
    })

    test('정상 요청이면 send를 호출하고 200 봉투를 반환한다', async () => {
        const { app, deps } = createApp()
        const input = { content: '안녕' }
        const res = await app.request('/chat/sessions/s1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.id).toBe(10)
        expect(deps.aiChatService.send).toHaveBeenCalledWith('u1', 's1', input)
    })

    test('checkLimit이 주어지면 통과 시 200과 레이트리밋 헤더를 반환한다', async () => {
        const checkLimit = mock(() => ({ allowed: true, limit: 10, remaining: 9, resetAt: 1_000 }))
        const { app, deps } = createApp(createMockDeps(), { checkLimit })
        const res = await app.request('/chat/sessions/s1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: '안녕' }),
        })
        expect(res.status).toBe(200)
        expect(checkLimit).toHaveBeenCalledWith('u1', 'ai:chat:send')
        expect(res.headers.get('X-RateLimit-Limit')).toBe('10')
        expect(deps.aiChatService.send).toHaveBeenCalled()
    })
})

describe('POST /chat/sessions/:sessionId/messages/stream', () => {
    test('SSE 로 delta 와 done 이벤트를 전송한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/chat/sessions/s1/messages/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: '안녕' }),
        })
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toContain('text/event-stream')
        const body = await res.text()
        expect(body).toContain('event: delta')
        expect(body).toContain(`data: ${JSON.stringify({ text: '응' })}`)
        expect(body).toContain('event: done')
        expect(body).toContain(`data: ${JSON.stringify({ ...streamDone, id: 10 })}`)
        expect(deps.aiChatService.sendStream).toHaveBeenCalledWith('u1', 's1', { content: '안녕' }, expect.any(AbortSignal))
    })

    test('미인증이면 401 JSON 을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(async () => null as never)
        const { app } = createApp(deps)
        const res = await app.request('/chat/sessions/s1/messages/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: '안녕' }),
        })
        expect(res.status).toBe(401)
    })

    test('스트림 시작 전 오류는 JSON errorResponse 로 반환한다', async () => {
        const deps = createMockDeps()
        deps.aiChatService.sendStream = mock(async () => {
            throw createAppError('AI_SESSION_NOT_FOUND')
        })
        const { app } = createApp(deps)
        const res = await app.request('/chat/sessions/s1/messages/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: '안녕' }),
        })
        expect(res.status).toBe(404)
        const body = await res.json()
        expect(body.success).toBe(false)
        expect(body.error.code).toBe('AI_SESSION_NOT_FOUND')
    })
})

describe('POST /chat/completions', () => {
    test('정상 요청이면 complete를 호출하고 200을 반환한다', async () => {
        const { app, deps } = createApp()
        const input = { provider: 'anthropic', modelId: 'claude', messages: [{ role: 'user', content: 'hi' }] }
        const res = await app.request('/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(deps.aiChatService.complete).toHaveBeenCalledWith('u1', input)
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(async () => null as never)
        const { app } = createApp(deps)
        const res = await app.request('/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'anthropic', modelId: 'claude', messages: [{ role: 'user', content: 'hi' }] }),
        })
        expect(res.status).toBe(401)
    })
})

describe('POST /chat/completions/stream', () => {
    const completionInput = { provider: 'anthropic', modelId: 'claude', messages: [{ role: 'user', content: 'hi' }] }

    test('SSE 로 delta 와 done 이벤트를 전송한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/chat/completions/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(completionInput),
        })
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toContain('text/event-stream')
        const body = await res.text()
        expect(body).toContain('event: delta')
        expect(body).toContain(`data: ${JSON.stringify({ text: '완' })}`)
        expect(body).toContain(`data: ${JSON.stringify({ text: '성' })}`)
        expect(body).toContain('event: done')
        expect(body).toContain(`data: ${JSON.stringify(streamDone)}`)
        expect(deps.aiChatService.completeStream).toHaveBeenCalledWith('u1', completionInput, expect.any(AbortSignal))
    })

    test('checkLimit이 주어지면 SSE 응답에도 레이트리밋 헤더를 포함한다', async () => {
        const checkLimit = mock(() => ({ allowed: true, limit: 10, remaining: 9, resetAt: 1_000 }))
        const { app } = createApp(createMockDeps(), { checkLimit })
        const res = await app.request('/chat/completions/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(completionInput),
        })
        expect(res.status).toBe(200)
        expect(checkLimit).toHaveBeenCalledWith('u1', 'ai:chat:completion')
        expect(res.headers.get('X-RateLimit-Limit')).toBe('10')
        expect(res.headers.get('content-type')).toContain('text/event-stream')
    })

    test('레이트리밋을 초과하면 429 JSON 을 반환한다', async () => {
        const checkLimit = mock(() => ({ allowed: false, limit: 10, remaining: 0, resetAt: 1_000 }))
        const { app } = createApp(createMockDeps(), { checkLimit })
        const res = await app.request('/chat/completions/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(completionInput),
        })
        expect(res.status).toBe(429)
        const body = await res.json()
        expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED')
    })

    test('스트림 시작 전 오류는 JSON errorResponse 로 반환한다', async () => {
        const deps = createMockDeps()
        deps.aiChatService.completeStream = mock(async () => {
            throw createAppError('AI_PROVIDER_NOT_FOUND')
        })
        const { app } = createApp(deps)
        const res = await app.request('/chat/completions/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(completionInput),
        })
        expect(res.status).toBe(404)
        const body = await res.json()
        expect(body.success).toBe(false)
        expect(body.error.code).toBe('AI_PROVIDER_NOT_FOUND')
    })

    test('스트림 중간 오류는 SSE error 이벤트로 전달한다', async () => {
        const deps = createMockDeps()
        deps.aiChatService.completeStream = mock(async () =>
            (async function* (): AsyncGenerator<AiChatStreamEvent> {
                yield { type: 'delta', text: '부분' }
                throw createAppError('AI_COMPLETION_FAILED')
            })(),
        )
        const { app } = createApp(deps)
        const res = await app.request('/chat/completions/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(completionInput),
        })
        expect(res.status).toBe(200)
        const body = await res.text()
        expect(body).toContain(`data: ${JSON.stringify({ text: '부분' })}`)
        expect(body).toContain('event: error')
        expect(body).toContain('"code":"AI_COMPLETION_FAILED"')
    })

    test('미인증이면 401 JSON 을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(async () => null as never)
        const { app } = createApp(deps)
        const res = await app.request('/chat/completions/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(completionInput),
        })
        expect(res.status).toBe(401)
    })
})

describe('SSE 스트림 중단 전파', () => {
    const completionInput = { provider: 'anthropic', modelId: 'claude', messages: [{ role: 'user', content: 'hi' }] }

    test('클라이언트가 스트림을 끊으면 서비스에 전달한 signal 을 abort 한다', async () => {
        const signals: (AbortSignal | undefined)[] = []
        const hangingStream = mock(async (_userId: string, _input: unknown, signal?: AbortSignal) => {
            signals.push(signal)
            return (async function* (): AsyncGenerator<AiChatStreamEvent> {
                yield { type: 'delta', text: '부분' }
                await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve()))
            })()
        })
        const { app } = createApp(createMockDeps(), {
            aiChatService: { ...createMockDeps().aiChatService, completeStream: hangingStream },
        })
        const res = await app.request('/chat/completions/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(completionInput),
        })
        expect(res.status).toBe(200)
        const reader = res.body!.getReader()
        await reader.read()
        await reader.cancel()
        expect(signals[0]).toBeInstanceOf(AbortSignal)
        expect(signals[0]?.aborted).toBe(true)
    })
})
