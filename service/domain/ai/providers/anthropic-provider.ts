import type { AiProviderClient, AiChatMessage, AiCompletionRequest, AiModelInfo, AiStreamEvent } from '../ai-provider'
import { providerErrorMessage } from '../ai-provider'
import { iterateSseEvents } from '../ai-sse'
import { createAppError, isAppError } from '../../../../lib/error'
import { maskProviderError } from '../../../../lib/mail-utils'

type AnthropicProviderDeps = {
    apiKey: string
    fetchFn?: typeof fetch
}

const ANTHROPIC_BASE = 'https://api.anthropic.com'
const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MAX_TOKENS = 4096
const LIST_PAGE_CAP = 20

type AnthropicContentBlock = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

const buildContent = (message: AiChatMessage): string | AnthropicContentBlock[] => {
    if (!message.images?.length) return message.content
    const blocks: AnthropicContentBlock[] = message.images.map((img) => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.dataBase64 },
    }))
    blocks.push({ type: 'text', text: message.content })
    return blocks
}

const buildMessagesBody = (request: AiCompletionRequest) => {
    const systemFromMessages = request.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n')
    const system = request.system ?? (systemFromMessages || undefined)
    const messages = request.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: buildContent(m) }))

    const body: Record<string, unknown> = {
        model: request.modelId,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages,
    }
    if (system) body.system = system
    if (request.temperature !== undefined) body.temperature = Math.min(1, Math.max(0, request.temperature))
    return body
}

type AnthropicStreamPayload = {
    type?: string
    message?: { model?: string; usage?: { input_tokens?: number } }
    delta?: { type?: string; text?: string }
    usage?: { output_tokens?: number }
    error?: { type?: string; message?: string }
}

const relayAnthropicStream = async function* (body: ReadableStream<Uint8Array>, fallbackModelId: string): AsyncGenerator<AiStreamEvent> {
    let content = ''
    let modelId = fallbackModelId
    let inputTokens: number | null = null
    let outputTokens: number | null = null
    try {
        for await (const sseEvent of iterateSseEvents(body)) {
            if (sseEvent.event === 'message_stop') break
            let payload: AnthropicStreamPayload
            try {
                payload = JSON.parse(sseEvent.data) as AnthropicStreamPayload
            } catch {
                continue
            }
            if (sseEvent.event === 'error' || payload.type === 'error') {
                throw createAppError('AI_COMPLETION_FAILED', {
                    detail: maskProviderError(payload.error?.message ?? 'stream error').slice(0, 500),
                })
            }
            if (sseEvent.event === 'message_start') {
                modelId = payload.message?.model ?? modelId
                inputTokens = payload.message?.usage?.input_tokens ?? inputTokens
            } else if (sseEvent.event === 'content_block_delta' && payload.delta?.type === 'text_delta' && payload.delta.text) {
                content += payload.delta.text
                yield { type: 'delta', text: payload.delta.text }
            } else if (sseEvent.event === 'message_delta') {
                outputTokens = payload.usage?.output_tokens ?? outputTokens
            }
        }
    } catch (error) {
        if (isAppError(error)) throw error
        throw createAppError('AI_COMPLETION_FAILED', { detail: maskProviderError(providerErrorMessage(error)).slice(0, 500) })
    }
    yield { type: 'done', result: { content, modelId, inputTokens, outputTokens } }
}

export const createAnthropicProvider = ({ apiKey, fetchFn = fetch }: AnthropicProviderDeps): AiProviderClient => {
    const authHeaders = { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION }

    const listModels = async () => {
        const models: AiModelInfo[] = []
        let afterId: string | undefined
        for (let page = 0; page < LIST_PAGE_CAP; page++) {
            const url = new URL(`${ANTHROPIC_BASE}/v1/models`)
            url.searchParams.set('limit', '1000')
            if (afterId) url.searchParams.set('after_id', afterId)
            const res = await fetchFn(url, { headers: authHeaders })
            if (!res.ok) throw createAppError('AI_MODEL_FETCH_FAILED', { status: res.status })
            const data = (await res.json()) as {
                data?: { id: string; display_name?: string; created_at?: string }[]
                has_more?: boolean
                last_id?: string
            }
            for (const m of data.data ?? []) {
                models.push({ modelId: m.id, displayName: m.display_name ?? null, metadata: m.created_at ? { createdAt: m.created_at } : null })
            }
            if (!data.has_more || !data.last_id) break
            afterId = data.last_id
        }
        return models
    }

    const complete = async (request: AiCompletionRequest) => {
        const res = await fetchFn(`${ANTHROPIC_BASE}/v1/messages`, {
            method: 'POST',
            headers: { ...authHeaders, 'content-type': 'application/json' },
            body: JSON.stringify(buildMessagesBody(request)),
            signal: request.signal,
        })
        if (!res.ok) {
            const errBody = await res.text().catch(() => '')
            throw createAppError('AI_COMPLETION_FAILED', { status: res.status, detail: maskProviderError(errBody).slice(0, 500) })
        }
        const data = (await res.json()) as {
            content?: { type: string; text?: string }[]
            model?: string
            usage?: { input_tokens?: number; output_tokens?: number }
        }
        const content = (data.content ?? [])
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join('')
        return {
            content,
            modelId: data.model ?? request.modelId,
            inputTokens: data.usage?.input_tokens ?? null,
            outputTokens: data.usage?.output_tokens ?? null,
        }
    }

    const completeStream = async (request: AiCompletionRequest) => {
        const res = await fetchFn(`${ANTHROPIC_BASE}/v1/messages`, {
            method: 'POST',
            headers: { ...authHeaders, 'content-type': 'application/json', 'accept': 'text/event-stream' },
            body: JSON.stringify({ ...buildMessagesBody(request), stream: true }),
            signal: request.signal,
        })
        if (!res.ok) {
            const errBody = await res.text().catch(() => '')
            throw createAppError('AI_COMPLETION_FAILED', { status: res.status, detail: maskProviderError(errBody).slice(0, 500) })
        }
        if (!res.body) throw createAppError('AI_COMPLETION_FAILED', { detail: 'empty response body' })
        return relayAnthropicStream(res.body, request.modelId)
    }

    const verify = async () => {
        try {
            await listModels()
            return { ok: true }
        } catch (error) {
            return { ok: false, error: maskProviderError(providerErrorMessage(error)).slice(0, 200) }
        }
    }

    return { listModels, complete, completeStream, verify }
}
