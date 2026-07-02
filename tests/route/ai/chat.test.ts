import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createAiChatRoute } from '../../../route/ai/chat'

const sendResult = { id: 10, role: 'assistant' as const, content: '응답입니다', modelId: 'claude', inputTokens: 5, outputTokens: 7, durationMs: 100 }
const completeResult = { content: '완성된 응답', modelId: 'claude', inputTokens: 3, outputTokens: 4 }

const createMockDeps = () => ({
    aiChatService: {
        send: mock(async () => sendResult),
        complete: mock(async () => completeResult),
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
