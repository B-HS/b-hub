import { describe, expect, test, mock } from 'bun:test'
import { createCodexProvider } from '../../../../../service/domain/ai/providers/codex-provider'

type FetchCall = [string | URL, RequestInit]

const jsonOk = (data: Record<string, unknown>) =>
    ({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) }) as unknown as Response

const httpErr = (status: number, body = 'provider error') =>
    ({ ok: false, status, json: () => Promise.resolve({}), text: () => Promise.resolve(body) }) as unknown as Response

const sseResponse = (chunks: string[]) => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
        start: (controller: ReadableStreamDefaultController<Uint8Array>) => {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
            controller.close()
        },
    })
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const queuedFetch = (responses: Response[]) => {
    let index = 0
    return mock(() => Promise.resolve(responses[index++]))
}

const callOf = (fetchMock: ReturnType<typeof mock>, index: number) => fetchMock.mock.calls[index] as unknown as FetchCall

const headersOf = (fetchMock: ReturnType<typeof mock>, index: number) => callOf(fetchMock, index)[1].headers as Record<string, string>

const getAccessTokenOk = () => mock(() => Promise.resolve({ accessToken: 'access-tok', accountId: 'acct-1' }))

describe('createCodexProvider.listModels', () => {
    test('/models?client_version 응답을 파싱한다', async () => {
        const fetchFn = queuedFetch([
            jsonOk({ models: [{ slug: 'gpt-5.1-codex', display_name: 'GPT-5.1 Codex', description: 'desc', context_window: 200000 }] }),
        ])
        const provider = createCodexProvider({ getAccessToken: getAccessTokenOk(), fetchFn, clientVersion: '1.2.3' })
        const models = await provider.listModels()
        expect(models).toEqual([{ modelId: 'gpt-5.1-codex', displayName: 'GPT-5.1 Codex', metadata: { description: 'desc', contextWindow: 200000 } }])
        expect(String(callOf(fetchFn, 0)[0])).toContain('/models?client_version=1.2.3')
    })

    test('빈 목록이면 fallback 3종을 반환한다', async () => {
        const fetchFn = queuedFetch([jsonOk({ models: [] })])
        const provider = createCodexProvider({ getAccessToken: getAccessTokenOk(), fetchFn })
        const models = await provider.listModels()
        expect(models.map((m) => m.modelId)).toEqual(['gpt-5.1-codex', 'gpt-5.1-codex-mini', 'gpt-5.1-codex-max'])
    })

    test('응답이 실패하면 AI_MODEL_FETCH_FAILED를 던진다', async () => {
        const fetchFn = queuedFetch([httpErr(500)])
        const provider = createCodexProvider({ getAccessToken: getAccessTokenOk(), fetchFn })
        await expect(provider.listModels()).rejects.toMatchObject({ code: 'AI_MODEL_FETCH_FAILED' })
    })
})

describe('createCodexProvider.complete', () => {
    test('SSE 델타를 누적하고 usage를 추출한다', async () => {
        const fetchFn = queuedFetch([
            sseResponse([
                'data: {"type":"response.output_text.delta","delta":"Hello"}\n',
                'data: {"type":"response.output_text.delta","delta":" World"}\n',
                'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5}}}\n',
            ]),
        ])
        const provider = createCodexProvider({ getAccessToken: getAccessTokenOk(), fetchFn })
        const result = await provider.complete({ modelId: 'gpt-5.1-codex', messages: [{ role: 'user', content: 'hi' }] })
        expect(result).toEqual({ content: 'Hello World', modelId: 'gpt-5.1-codex', inputTokens: 10, outputTokens: 5 })
    })

    test('청크 경계로 잘린 SSE 라인도 버퍼링하여 누적한다', async () => {
        const fetchFn = queuedFetch([
            sseResponse([
                'data: {"type":"response.output_text.d',
                'elta","delta":"Split"}\n',
                'data: {"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":2}}}\n',
            ]),
        ])
        const provider = createCodexProvider({ getAccessToken: getAccessTokenOk(), fetchFn })
        const result = await provider.complete({ modelId: 'gpt-5.1-codex', messages: [{ role: 'user', content: 'hi' }] })
        expect(result.content).toBe('Split')
        expect(result.inputTokens).toBe(1)
    })

    test('Authorization/chatgpt-account-id/originator 헤더를 보낸다', async () => {
        const fetchFn = queuedFetch([sseResponse(['data: {"type":"response.completed","response":{}}\n'])])
        const provider = createCodexProvider({ getAccessToken: getAccessTokenOk(), fetchFn })
        await provider.complete({ modelId: 'gpt-5.1-codex', messages: [{ role: 'user', content: 'hi' }] })
        const headers = headersOf(fetchFn, 0)
        expect(headers.authorization).toBe('Bearer access-tok')
        expect(headers['chatgpt-account-id']).toBe('acct-1')
        expect(headers.originator).toBe('codex_cli_rs')
        expect(String(callOf(fetchFn, 0)[0])).toContain('/responses')
    })

    test('response.failed면 AI_COMPLETION_FAILED를 던진다', async () => {
        const fetchFn = queuedFetch([sseResponse(['data: {"type":"response.failed","response":{"error":{"message":"boom"}}}\n'])])
        const provider = createCodexProvider({ getAccessToken: getAccessTokenOk(), fetchFn })
        await expect(provider.complete({ modelId: 'gpt-5.1-codex', messages: [{ role: 'user', content: 'hi' }] })).rejects.toMatchObject({
            code: 'AI_COMPLETION_FAILED',
        })
    })

    test('HTTP 응답이 실패하면 AI_COMPLETION_FAILED를 던진다', async () => {
        const fetchFn = queuedFetch([httpErr(500, 'server error')])
        const provider = createCodexProvider({ getAccessToken: getAccessTokenOk(), fetchFn })
        await expect(provider.complete({ modelId: 'gpt-5.1-codex', messages: [{ role: 'user', content: 'hi' }] })).rejects.toMatchObject({
            code: 'AI_COMPLETION_FAILED',
        })
    })
})

describe('createCodexProvider.completeStream', () => {
    test('델타를 순서대로 방출하고 마지막에 done 결과를 방출한다', async () => {
        const fetchFn = queuedFetch([
            sseResponse([
                'data: {"type":"response.output_text.delta","delta":"Hello"}\n',
                'data: {"type":"response.output_text.delta","delta":" World"}\n',
                'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5}}}\n',
            ]),
        ])
        const provider = createCodexProvider({ getAccessToken: getAccessTokenOk(), fetchFn })
        const events = []
        for await (const event of await provider.completeStream({ modelId: 'gpt-5.1-codex', messages: [{ role: 'user', content: 'hi' }] })) {
            events.push(event)
        }
        expect(events).toEqual([
            { type: 'delta', text: 'Hello' },
            { type: 'delta', text: ' World' },
            { type: 'done', result: { content: 'Hello World', modelId: 'gpt-5.1-codex', inputTokens: 10, outputTokens: 5 } },
        ])
    })

    test('response.failed 이벤트면 이터레이션 중 AI_COMPLETION_FAILED를 던진다', async () => {
        const fetchFn = queuedFetch([sseResponse(['data: {"type":"response.failed","response":{"error":{"message":"boom"}}}\n'])])
        const provider = createCodexProvider({ getAccessToken: getAccessTokenOk(), fetchFn })
        const events = await provider.completeStream({ modelId: 'gpt-5.1-codex', messages: [{ role: 'user', content: 'hi' }] })
        await expect(
            (async () => {
                for await (const event of events) void event
            })(),
        ).rejects.toMatchObject({ code: 'AI_COMPLETION_FAILED' })
    })

    test('HTTP 응답이 실패하면 스트림 시작 전에 reject 한다', async () => {
        const fetchFn = queuedFetch([httpErr(429, 'rate limited')])
        const provider = createCodexProvider({ getAccessToken: getAccessTokenOk(), fetchFn })
        await expect(provider.completeStream({ modelId: 'gpt-5.1-codex', messages: [{ role: 'user', content: 'hi' }] })).rejects.toMatchObject({
            code: 'AI_COMPLETION_FAILED',
        })
    })
})

describe('createCodexProvider.verify', () => {
    test('listModels가 성공하면 ok:true를 반환한다', async () => {
        const fetchFn = queuedFetch([jsonOk({ models: [{ slug: 'gpt-5.1-codex' }] })])
        const provider = createCodexProvider({ getAccessToken: getAccessTokenOk(), fetchFn })
        expect(await provider.verify()).toEqual({ ok: true })
    })

    test('listModels가 실패하면 ok:false를 반환한다', async () => {
        const fetchFn = queuedFetch([httpErr(401)])
        const provider = createCodexProvider({ getAccessToken: getAccessTokenOk(), fetchFn })
        expect((await provider.verify()).ok).toBe(false)
    })
})
