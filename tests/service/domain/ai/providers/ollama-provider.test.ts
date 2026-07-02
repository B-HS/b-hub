import { describe, expect, test, mock } from 'bun:test'
import { createOllamaProvider } from '../../../../../service/domain/ai/providers/ollama-provider'

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

describe('createOllamaProvider.listModels', () => {
    test('/api/tags 응답을 파싱한다', async () => {
        const fetchFn = queuedFetch([jsonOk({ models: [{ name: 'llama3', model: 'llama3:latest', details: { family: 'llama' } }] })])
        const provider = createOllamaProvider({ apiKey: 'test-key', fetchFn })
        const models = await provider.listModels()
        expect(models).toEqual([{ modelId: 'llama3', displayName: 'llama3:latest', metadata: { family: 'llama' } }])
        expect(String(callOf(fetchFn, 0)[0])).toContain('/api/tags')
    })

    test('Bearer 인증 헤더를 보낸다', async () => {
        const fetchFn = queuedFetch([jsonOk({ models: [] })])
        const provider = createOllamaProvider({ apiKey: 'my-key', fetchFn })
        await provider.listModels()
        expect(headersOf(fetchFn, 0).authorization).toBe('Bearer my-key')
    })

    test('응답이 실패하면 AI_MODEL_FETCH_FAILED를 던진다', async () => {
        const fetchFn = queuedFetch([httpErr(500)])
        const provider = createOllamaProvider({ apiKey: 'test-key', fetchFn })
        await expect(provider.listModels()).rejects.toMatchObject({ code: 'AI_MODEL_FETCH_FAILED' })
    })
})

describe('createOllamaProvider.complete', () => {
    test('/api/chat를 stream:false로 요청하고 응답을 매핑한다', async () => {
        const fetchFn = queuedFetch([jsonOk({ message: { content: 'Hi there' }, model: 'llama3', prompt_eval_count: 12, eval_count: 8 })])
        const provider = createOllamaProvider({ apiKey: 'test-key', fetchFn })
        const result = await provider.complete({ modelId: 'llama3', messages: [{ role: 'user', content: 'hi' }] })
        expect(String(callOf(fetchFn, 0)[0])).toContain('/api/chat')
        expect(bodyOf(fetchFn, 0).stream).toBe(false)
        expect(result).toEqual({ content: 'Hi there', modelId: 'llama3', inputTokens: 12, outputTokens: 8 })
    })

    test('system이 있으면 messages 앞에 추가한다', async () => {
        const fetchFn = queuedFetch([jsonOk({ message: { content: 'ok' } })])
        const provider = createOllamaProvider({ apiKey: 'test-key', fetchFn })
        await provider.complete({ modelId: 'llama3', system: 'be concise', messages: [{ role: 'user', content: 'hello' }] })
        const body = bodyOf(fetchFn, 0) as { messages: { role: string; content: string }[] }
        expect(body.messages[0]).toEqual({ role: 'system', content: 'be concise' })
        expect(body.messages[1]).toEqual({ role: 'user', content: 'hello' })
    })

    test('이미지를 base64 배열로 전송한다', async () => {
        const fetchFn = queuedFetch([jsonOk({ message: { content: 'ok' } })])
        const provider = createOllamaProvider({ apiKey: 'test-key', fetchFn })
        await provider.complete({
            modelId: 'llava',
            messages: [{ role: 'user', content: 'describe', images: [{ mimeType: 'image/png', dataBase64: 'AAAA' }] }],
        })
        const body = bodyOf(fetchFn, 0) as { messages: { images?: string[] }[] }
        expect(body.messages[0].images).toEqual(['AAAA'])
    })

    test('message가 없으면 빈 문자열과 null 토큰을 반환한다', async () => {
        const fetchFn = queuedFetch([jsonOk({ model: 'llama3' })])
        const provider = createOllamaProvider({ apiKey: 'test-key', fetchFn })
        const result = await provider.complete({ modelId: 'llama3', messages: [{ role: 'user', content: 'hi' }] })
        expect(result).toEqual({ content: '', modelId: 'llama3', inputTokens: null, outputTokens: null })
    })

    test('응답이 실패하면 AI_COMPLETION_FAILED를 던진다', async () => {
        const fetchFn = queuedFetch([httpErr(500, 'boom')])
        const provider = createOllamaProvider({ apiKey: 'test-key', fetchFn })
        await expect(provider.complete({ modelId: 'llama3', messages: [{ role: 'user', content: 'hi' }] })).rejects.toMatchObject({
            code: 'AI_COMPLETION_FAILED',
        })
    })
})

describe('createOllamaProvider.verify', () => {
    test('listModels가 성공하면 ok:true를 반환한다', async () => {
        const fetchFn = queuedFetch([jsonOk({ models: [] })])
        const provider = createOllamaProvider({ apiKey: 'test-key', fetchFn })
        expect(await provider.verify()).toEqual({ ok: true })
    })

    test('listModels가 실패하면 ok:false를 반환한다', async () => {
        const fetchFn = queuedFetch([httpErr(401)])
        const provider = createOllamaProvider({ apiKey: 'test-key', fetchFn })
        expect((await provider.verify()).ok).toBe(false)
    })
})
