import type { AiProviderClient, AiChatMessage, AiCompletionRequest, AiModelInfo, AiStreamEvent } from '../ai-provider'
import { providerErrorMessage } from '../ai-provider'
import { iterateStreamLines } from '../ai-sse'
import { createAppError, isAppError } from '../../../../lib/error'
import { maskProviderError } from '../../../../lib/mail-utils'

type OllamaProviderDeps = {
    apiKey: string
    fetchFn?: typeof fetch
}

const OLLAMA_BASE = 'https://ollama.com'

const buildMessage = (message: AiChatMessage) => {
    const base: { role: string; content: string; images?: string[] } = { role: message.role, content: message.content }
    if (message.images?.length) base.images = message.images.map((img) => img.dataBase64)
    return base
}

const buildChatBody = (request: AiCompletionRequest, stream: boolean) => {
    const messages = request.system
        ? [{ role: 'system', content: request.system }, ...request.messages.map(buildMessage)]
        : request.messages.map(buildMessage)
    const options: Record<string, unknown> = {}
    if (request.temperature !== undefined) options.temperature = request.temperature
    if (request.maxTokens !== undefined) options.num_predict = request.maxTokens

    const body: Record<string, unknown> = { model: request.modelId, messages, stream }
    if (Object.keys(options).length > 0) body.options = options
    return body
}

type OllamaStreamChunk = {
    model?: string
    message?: { content?: string }
    done?: boolean
    prompt_eval_count?: number
    eval_count?: number
    error?: string
}

const relayOllamaStream = async function* (body: ReadableStream<Uint8Array>, fallbackModelId: string): AsyncGenerator<AiStreamEvent> {
    let content = ''
    let modelId = fallbackModelId
    let inputTokens: number | null = null
    let outputTokens: number | null = null
    try {
        for await (const line of iterateStreamLines(body)) {
            if (!line.trim()) continue
            let chunk: OllamaStreamChunk
            try {
                chunk = JSON.parse(line) as OllamaStreamChunk
            } catch {
                continue
            }
            if (chunk.error) throw createAppError('AI_COMPLETION_FAILED', { detail: maskProviderError(chunk.error).slice(0, 500) })
            if (chunk.message?.content) {
                content += chunk.message.content
                yield { type: 'delta', text: chunk.message.content }
            }
            if (chunk.done) {
                modelId = chunk.model ?? modelId
                inputTokens = chunk.prompt_eval_count ?? null
                outputTokens = chunk.eval_count ?? null
                break
            }
        }
    } catch (error) {
        if (isAppError(error)) throw error
        throw createAppError('AI_COMPLETION_FAILED', { detail: maskProviderError(providerErrorMessage(error)).slice(0, 500) })
    }
    yield { type: 'done', result: { content, modelId, inputTokens, outputTokens } }
}

export const createOllamaProvider = ({ apiKey, fetchFn = fetch }: OllamaProviderDeps): AiProviderClient => {
    const authHeader = { authorization: `Bearer ${apiKey}` }

    const listModels = async () => {
        const res = await fetchFn(`${OLLAMA_BASE}/api/tags`, { headers: authHeader })
        if (!res.ok) throw createAppError('AI_MODEL_FETCH_FAILED', { status: res.status })
        const data = (await res.json()) as { models?: { name: string; model?: string; details?: Record<string, unknown> }[] }
        const models: AiModelInfo[] = (data.models ?? []).map((m) => ({
            modelId: m.name,
            displayName: m.model ?? m.name,
            metadata: m.details ?? null,
        }))
        return models
    }

    const complete = async (request: AiCompletionRequest) => {
        const res = await fetchFn(`${OLLAMA_BASE}/api/chat`, {
            method: 'POST',
            headers: { ...authHeader, 'content-type': 'application/json' },
            body: JSON.stringify(buildChatBody(request, false)),
        })
        if (!res.ok) {
            const errBody = await res.text().catch(() => '')
            throw createAppError('AI_COMPLETION_FAILED', { status: res.status, detail: maskProviderError(errBody).slice(0, 500) })
        }
        const data = (await res.json()) as { message?: { content?: string }; model?: string; prompt_eval_count?: number; eval_count?: number }
        return {
            content: data.message?.content ?? '',
            modelId: data.model ?? request.modelId,
            inputTokens: data.prompt_eval_count ?? null,
            outputTokens: data.eval_count ?? null,
        }
    }

    const completeStream = async (request: AiCompletionRequest) => {
        const res = await fetchFn(`${OLLAMA_BASE}/api/chat`, {
            method: 'POST',
            headers: { ...authHeader, 'content-type': 'application/json' },
            body: JSON.stringify(buildChatBody(request, true)),
        })
        if (!res.ok) {
            const errBody = await res.text().catch(() => '')
            throw createAppError('AI_COMPLETION_FAILED', { status: res.status, detail: maskProviderError(errBody).slice(0, 500) })
        }
        if (!res.body) throw createAppError('AI_COMPLETION_FAILED', { detail: 'empty response body' })
        return relayOllamaStream(res.body, request.modelId)
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
