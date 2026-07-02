import type { AiProviderClient, AiChatMessage, AiCompletionRequest, AiModelInfo } from '../ai-provider'
import { providerErrorMessage } from '../ai-provider'
import { createAppError } from '../../../../lib/error'
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
                data: { id: string; display_name?: string; created_at?: string }[]
                has_more?: boolean
                last_id?: string
            }
            for (const m of data.data) {
                models.push({ modelId: m.id, displayName: m.display_name ?? null, metadata: m.created_at ? { createdAt: m.created_at } : null })
            }
            if (!data.has_more || !data.last_id) break
            afterId = data.last_id
        }
        return models
    }

    const complete = async (request: AiCompletionRequest) => {
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
        if (request.temperature !== undefined) body.temperature = request.temperature

        const res = await fetchFn(`${ANTHROPIC_BASE}/v1/messages`, {
            method: 'POST',
            headers: { ...authHeaders, 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })
        if (!res.ok) {
            const errBody = await res.text().catch(() => '')
            throw createAppError('AI_COMPLETION_FAILED', { status: res.status, detail: maskProviderError(errBody).slice(0, 500) })
        }
        const data = (await res.json()) as {
            content: { type: string; text?: string }[]
            model?: string
            usage?: { input_tokens?: number; output_tokens?: number }
        }
        const content = data.content
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
