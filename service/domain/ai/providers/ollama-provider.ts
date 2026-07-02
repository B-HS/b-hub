import type { AiProviderClient, AiChatMessage, AiCompletionRequest, AiModelInfo } from '../ai-provider'
import { providerErrorMessage } from '../ai-provider'
import { createAppError } from '../../../../lib/error'
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
        const messages = request.system
            ? [{ role: 'system', content: request.system }, ...request.messages.map(buildMessage)]
            : request.messages.map(buildMessage)
        const options: Record<string, unknown> = {}
        if (request.temperature !== undefined) options.temperature = request.temperature
        if (request.maxTokens !== undefined) options.num_predict = request.maxTokens

        const body: Record<string, unknown> = { model: request.modelId, messages, stream: false }
        if (Object.keys(options).length > 0) body.options = options

        const res = await fetchFn(`${OLLAMA_BASE}/api/chat`, {
            method: 'POST',
            headers: { ...authHeader, 'content-type': 'application/json' },
            body: JSON.stringify(body),
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

    const verify = async () => {
        try {
            await listModels()
            return { ok: true }
        } catch (error) {
            return { ok: false, error: maskProviderError(providerErrorMessage(error)).slice(0, 200) }
        }
    }

    return { listModels, complete, verify }
}
