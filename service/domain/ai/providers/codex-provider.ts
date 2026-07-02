import type { AiProviderClient, AiChatMessage, AiCompletionRequest, AiModelInfo } from '../ai-provider'
import { providerErrorMessage } from '../ai-provider'
import { createAppError } from '../../../../lib/error'
import { maskProviderError } from '../../../../lib/mail-utils'

type CodexProviderDeps = {
    getAccessToken: () => Promise<{ accessToken: string; accountId: string }>
    fetchFn?: typeof fetch
    clientVersion?: string
}

const CODEX_BASE = 'https://chatgpt.com/backend-api/codex'
const DEFAULT_CLIENT_VERSION = '0.50.0'
const CODEX_FALLBACK_MODELS: AiModelInfo[] = [
    { modelId: 'gpt-5.1-codex', displayName: 'GPT-5.1 Codex', metadata: null },
    { modelId: 'gpt-5.1-codex-mini', displayName: 'GPT-5.1 Codex Mini', metadata: null },
    { modelId: 'gpt-5.1-codex-max', displayName: 'GPT-5.1 Codex Max', metadata: null },
]

const buildInput = (messages: AiChatMessage[]) =>
    messages
        .filter((m) => m.role !== 'system')
        .map((m) => {
            const textType = m.role === 'assistant' ? 'output_text' : 'input_text'
            const content: Record<string, unknown>[] = (m.images ?? []).map((img) => ({
                type: 'input_image',
                image_url: `data:${img.mimeType};base64,${img.dataBase64}`,
            }))
            content.push({ type: textType, text: m.content })
            return { type: 'message', role: m.role, content }
        })

type CodexUsage = { input_tokens?: number; output_tokens?: number }

const parseResponsesSse = async (res: Response): Promise<{ text: string; usage: CodexUsage | null }> => {
    if (!res.body) throw createAppError('AI_COMPLETION_FAILED', { detail: 'empty response body' })
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let text = ''
    let usage: CodexUsage | null = null
    let failed: string | null = null

    const handleLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) return
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') return
        let evt: {
            type?: string
            delta?: string
            response?: { usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } }
        }
        try {
            evt = JSON.parse(payload)
        } catch {
            return
        }
        if (evt.type === 'response.output_text.delta' && typeof evt.delta === 'string') text += evt.delta
        else if (evt.type === 'response.completed') usage = evt.response?.usage ?? usage
        else if (evt.type === 'response.failed' || evt.type === 'response.incomplete') failed = evt.response?.error?.message ?? evt.type
    }

    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) handleLine(line)
    }
    if (buffer) handleLine(buffer)

    if (failed) throw createAppError('AI_COMPLETION_FAILED', { detail: maskProviderError(failed).slice(0, 500) })
    return { text, usage }
}

export const createCodexProvider = ({
    getAccessToken,
    fetchFn = fetch,
    clientVersion = DEFAULT_CLIENT_VERSION,
}: CodexProviderDeps): AiProviderClient => {
    const buildHeaders = (accessToken: string, accountId: string) => ({
        'authorization': `Bearer ${accessToken}`,
        'chatgpt-account-id': accountId,
        'originator': 'codex_cli_rs',
    })

    const listModels = async () => {
        const { accessToken, accountId } = await getAccessToken()
        const res = await fetchFn(`${CODEX_BASE}/models?client_version=${encodeURIComponent(clientVersion)}`, {
            headers: buildHeaders(accessToken, accountId),
        })
        if (!res.ok) throw createAppError('AI_MODEL_FETCH_FAILED', { status: res.status })
        const data = (await res.json()) as { models?: { slug: string; display_name?: string; description?: string; context_window?: number }[] }
        const models = data.models ?? []
        if (models.length === 0) return CODEX_FALLBACK_MODELS
        return models.map((m) => ({
            modelId: m.slug,
            displayName: m.display_name ?? null,
            metadata: {
                ...(m.description ? { description: m.description } : {}),
                ...(m.context_window ? { contextWindow: m.context_window } : {}),
            },
        }))
    }

    const complete = async (request: AiCompletionRequest) => {
        const { accessToken, accountId } = await getAccessToken()
        const body = {
            model: request.modelId,
            instructions: request.system ?? '',
            input: buildInput(request.messages),
            store: false,
            stream: true,
            tool_choice: 'auto',
            include: [] as string[],
        }
        const res = await fetchFn(`${CODEX_BASE}/responses`, {
            method: 'POST',
            headers: {
                ...buildHeaders(accessToken, accountId),
                'content-type': 'application/json',
                'accept': 'text/event-stream',
                'session_id': crypto.randomUUID(),
            },
            body: JSON.stringify(body),
        })
        if (!res.ok) {
            const errBody = await res.text().catch(() => '')
            throw createAppError('AI_COMPLETION_FAILED', { status: res.status, detail: maskProviderError(errBody).slice(0, 500) })
        }
        const { text, usage } = await parseResponsesSse(res)
        return {
            content: text,
            modelId: request.modelId,
            inputTokens: usage?.input_tokens ?? null,
            outputTokens: usage?.output_tokens ?? null,
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
