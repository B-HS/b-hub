import { describe, expect, test, mock } from 'bun:test'
import { createAnthropicProvider } from '../../../../../service/domain/ai/providers/anthropic-provider'

type FetchCall = [string | URL, RequestInit]

const jsonOk = (data: Record<string, unknown>) =>
    ({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) }) as unknown as Response

const httpErr = (status: number, body = 'provider error') =>
    ({ ok: false, status, json: () => Promise.resolve({}), text: () => Promise.resolve(body) }) as unknown as Response

const queuedFetch = (responses: Response[]) => {
    let index = 0
    return mock(() => Promise.resolve(responses[index++]))
}

const callOf = (fetchMock: ReturnType<typeof mock>, index: number) => fetchMock.mock.calls[index] as unknown as FetchCall

const bodyOf = (fetchMock: ReturnType<typeof mock>, index: number) =>
    JSON.parse(callOf(fetchMock, index)[1].body as string) as Record<string, unknown>

const headersOf = (fetchMock: ReturnType<typeof mock>, index: number) => callOf(fetchMock, index)[1].headers as Record<string, string>

describe('createAnthropicProvider.listModels', () => {
    test('GET /v1/models 응답을 파싱한다', async () => {
        const fetchFn = queuedFetch([
            jsonOk({ data: [{ id: 'claude-opus-4', display_name: 'Claude Opus 4', created_at: '2025-01-01' }], has_more: false }),
        ])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        const models = await provider.listModels()
        expect(models).toEqual([{ modelId: 'claude-opus-4', displayName: 'Claude Opus 4', metadata: { createdAt: '2025-01-01' } }])
    })

    test('x-api-key와 anthropic-version 헤더를 보낸다', async () => {
        const fetchFn = queuedFetch([jsonOk({ data: [], has_more: false })])
        const provider = createAnthropicProvider({ apiKey: 'secret-key', fetchFn })
        await provider.listModels()
        const headers = headersOf(fetchFn, 0)
        expect(headers['x-api-key']).toBe('secret-key')
        expect(headers['anthropic-version']).toBe('2023-06-01')
        expect(String(callOf(fetchFn, 0)[0])).toContain('/v1/models')
    })

    test('has_more면 after_id로 다음 페이지를 이어 조회한다', async () => {
        const fetchFn = queuedFetch([
            jsonOk({ data: [{ id: 'model-a' }], has_more: true, last_id: 'model-a' }),
            jsonOk({ data: [{ id: 'model-b' }], has_more: false }),
        ])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        const models = await provider.listModels()
        expect(models.map((m) => m.modelId)).toEqual(['model-a', 'model-b'])
        expect(fetchFn.mock.calls.length).toBe(2)
        expect(String(callOf(fetchFn, 1)[0])).toContain('after_id=model-a')
    })

    test('응답이 실패하면 AI_MODEL_FETCH_FAILED를 던진다', async () => {
        const fetchFn = queuedFetch([httpErr(500)])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        await expect(provider.listModels()).rejects.toMatchObject({ code: 'AI_MODEL_FETCH_FAILED' })
    })
})

describe('createAnthropicProvider.complete', () => {
    test('POST /v1/messages에 max_tokens 기본값 4096을 보낸다', async () => {
        const fetchFn = queuedFetch([jsonOk({ content: [{ type: 'text', text: 'hi' }] })])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        await provider.complete({ modelId: 'claude-x', messages: [{ role: 'user', content: 'hi' }] })
        expect(String(callOf(fetchFn, 0)[0])).toContain('/v1/messages')
        expect(bodyOf(fetchFn, 0).max_tokens).toBe(4096)
    })

    test('system 역할 메시지를 system 필드로 분리한다', async () => {
        const fetchFn = queuedFetch([jsonOk({ content: [{ type: 'text', text: 'ok' }] })])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        await provider.complete({
            modelId: 'claude-x',
            messages: [
                { role: 'system', content: 'you are helpful' },
                { role: 'user', content: 'hello' },
            ],
        })
        const body = bodyOf(fetchFn, 0)
        expect(body.system).toBe('you are helpful')
        expect(body.messages).toEqual([{ role: 'user', content: 'hello' }])
    })

    test('content[].text를 취합하고 usage를 매핑한다', async () => {
        const fetchFn = queuedFetch([
            jsonOk({
                content: [{ type: 'text', text: 'Hello' }, { type: 'text', text: ' World' }, { type: 'tool_use' }],
                model: 'claude-real',
                usage: { input_tokens: 12, output_tokens: 7 },
            }),
        ])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        const result = await provider.complete({ modelId: 'claude-x', messages: [{ role: 'user', content: 'hi' }] })
        expect(result).toEqual({ content: 'Hello World', modelId: 'claude-real', inputTokens: 12, outputTokens: 7 })
    })

    test('usage가 없으면 토큰을 null로 반환한다', async () => {
        const fetchFn = queuedFetch([jsonOk({ content: [{ type: 'text', text: 'x' }] })])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        const result = await provider.complete({ modelId: 'claude-x', messages: [{ role: 'user', content: 'hi' }] })
        expect(result.inputTokens).toBeNull()
        expect(result.outputTokens).toBeNull()
    })

    test('이미지가 있으면 image content block을 구성한다', async () => {
        const fetchFn = queuedFetch([jsonOk({ content: [{ type: 'text', text: 'ok' }] })])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        await provider.complete({
            modelId: 'claude-x',
            messages: [{ role: 'user', content: 'describe', images: [{ mimeType: 'image/png', dataBase64: 'AAAA' }] }],
        })
        const body = bodyOf(fetchFn, 0) as {
            messages: { content: { type: string; source?: { media_type: string; data: string }; text?: string }[] }[]
        }
        const content = body.messages[0].content
        expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } })
        expect(content[1]).toEqual({ type: 'text', text: 'describe' })
    })

    test('응답이 실패하면 AI_COMPLETION_FAILED를 던진다', async () => {
        const fetchFn = queuedFetch([httpErr(429, 'rate limited')])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        await expect(provider.complete({ modelId: 'claude-x', messages: [{ role: 'user', content: 'hi' }] })).rejects.toMatchObject({
            code: 'AI_COMPLETION_FAILED',
        })
    })
})

const sseResponse = (blocks: string[]) => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
        start: (controller: ReadableStreamDefaultController<Uint8Array>) => {
            for (const block of blocks) controller.enqueue(encoder.encode(block))
            controller.close()
        },
    })
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

describe('createAnthropicProvider.completeStream', () => {
    test('stream:true 바디로 /v1/messages 를 호출한다', async () => {
        const fetchFn = queuedFetch([sseResponse(['event: message_stop\ndata: {"type":"message_stop"}\n\n'])])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        const events = await provider.completeStream({ modelId: 'claude-x', messages: [{ role: 'user', content: 'hi' }] })
        for await (const event of events) void event
        expect(bodyOf(fetchFn, 0).stream).toBe(true)
        expect(String(callOf(fetchFn, 0)[0])).toContain('/v1/messages')
    })

    test('text_delta 를 방출하고 message_start/message_delta 의 usage 를 done 에 집계한다', async () => {
        const fetchFn = queuedFetch([
            sseResponse([
                'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-real","usage":{"input_tokens":12}}}\n\n',
                'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
                'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
                'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" World"}}\n\n',
                'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
                'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}\n\n',
                'event: message_stop\ndata: {"type":"message_stop"}\n\n',
            ]),
        ])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        const events = []
        for await (const event of await provider.completeStream({ modelId: 'claude-x', messages: [{ role: 'user', content: 'hi' }] })) {
            events.push(event)
        }
        expect(events).toEqual([
            { type: 'delta', text: 'Hello' },
            { type: 'delta', text: ' World' },
            { type: 'done', result: { content: 'Hello World', modelId: 'claude-real', inputTokens: 12, outputTokens: 7 } },
        ])
    })

    test('error 이벤트면 이터레이션 중 AI_COMPLETION_FAILED를 던진다', async () => {
        const fetchFn = queuedFetch([
            sseResponse(['event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n']),
        ])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        const events = await provider.completeStream({ modelId: 'claude-x', messages: [{ role: 'user', content: 'hi' }] })
        await expect(
            (async () => {
                for await (const event of events) void event
            })(),
        ).rejects.toMatchObject({ code: 'AI_COMPLETION_FAILED' })
    })

    test('HTTP 응답이 실패하면 스트림 시작 전에 reject 한다', async () => {
        const fetchFn = queuedFetch([httpErr(429, 'rate limited')])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        await expect(provider.completeStream({ modelId: 'claude-x', messages: [{ role: 'user', content: 'hi' }] })).rejects.toMatchObject({
            code: 'AI_COMPLETION_FAILED',
        })
    })
})

describe('createAnthropicProvider.verify', () => {
    test('listModels가 성공하면 ok:true를 반환한다', async () => {
        const fetchFn = queuedFetch([jsonOk({ data: [], has_more: false })])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        expect(await provider.verify()).toEqual({ ok: true })
    })

    test('listModels가 실패하면 ok:false를 반환한다', async () => {
        const fetchFn = queuedFetch([httpErr(401)])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        const result = await provider.verify()
        expect(result.ok).toBe(false)
    })
})

describe('createAnthropicProvider signal 전파', () => {
    test('completeStream 은 요청의 signal 을 fetch 에 넘긴다', async () => {
        const fetchFn = queuedFetch([sseResponse(['event: message_stop\ndata: {"type":"message_stop"}\n\n'])])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        const controller = new AbortController()
        const events = await provider.completeStream({ modelId: 'claude-x', messages: [{ role: 'user', content: 'hi' }], signal: controller.signal })
        for await (const event of events) void event
        expect(callOf(fetchFn, 0)[1].signal).toBe(controller.signal)
    })

    test('complete 도 요청의 signal 을 fetch 에 넘긴다', async () => {
        const fetchFn = queuedFetch([jsonOk({ content: [{ type: 'text', text: 'hi' }] })])
        const provider = createAnthropicProvider({ apiKey: 'test-key', fetchFn })
        const controller = new AbortController()
        await provider.complete({ modelId: 'claude-x', messages: [{ role: 'user', content: 'hi' }], signal: controller.signal })
        expect(callOf(fetchFn, 0)[1].signal).toBe(controller.signal)
    })
})
