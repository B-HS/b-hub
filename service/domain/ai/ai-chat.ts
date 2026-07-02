import type { AiMessage, AiPrompt } from '../../../db/schema'
import type { AiConnectionService } from './ai-connection'
import type { AiPromptService } from './ai-prompt'
import type { AiSessionService } from './ai-session'
import type { AiAttachmentService } from './ai-attachment'
import type { AiChatMessage } from './ai-provider'
import { providerErrorMessage } from './ai-provider'
import type { AiChatSend, AiCompletion } from '../../../dto/ai/chat'

const HISTORY_LIMIT = 50

export type AiUsageLogger = (entry: { errorCode: string; severity: number; errorDescription?: string; details: Record<string, unknown> }) => void

type AiChatDeps = {
    connectionService: AiConnectionService
    promptService: AiPromptService
    sessionService: AiSessionService
    attachmentService: AiAttachmentService
    logUsage: AiUsageLogger
}

const settleQuietly = (p: Promise<unknown>) => p.then(() => undefined).catch(() => undefined)

const assemblePrompts = (prompts: AiPrompt[]) => {
    const active = prompts.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
    const systemText = active
        .filter((p) => p.stage === 'system' || p.stage === 'context')
        .map((p) => p.content)
        .join('\n\n')
    const seedMessages: AiChatMessage[] = active
        .filter((p) => p.stage === 'user' || p.stage === 'assistant')
        .map((p) => ({ role: p.stage === 'assistant' ? 'assistant' : 'user', content: p.content }))
    return { systemText: systemText || undefined, seedMessages }
}

const mergeSystem = (base: string | undefined, extra: string) => [base, extra].filter(Boolean).join('\n\n') || undefined

const toChatMessage = (m: AiMessage): AiChatMessage => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })

export const createAiChatService = ({ connectionService, promptService, sessionService, attachmentService, logUsage }: AiChatDeps) => {
    const send = async (userId: string, sessionId: string, input: AiChatSend) => {
        const session = await sessionService.getOwned(userId, sessionId)
        const { row, client } = await connectionService.resolveClient(userId, session.provider)

        const prompts = session.promptIds?.length ? await promptService.resolveOwned(userId, session.promptIds) : []
        const { systemText, seedMessages } = assemblePrompts(prompts)
        const history = await sessionService.listRecentMessages(sessionId, HISTORY_LIMIT)
        const images = input.attachmentIds?.length ? await attachmentService.resolveImages(userId, input.attachmentIds) : []

        const modelId = input.modelId ?? session.modelId
        const messages: AiChatMessage[] = [
            ...seedMessages,
            ...history.map(toChatMessage),
            { role: 'user', content: input.content, images: images.length ? images : undefined },
        ]

        const startedAt = Date.now()
        let result
        try {
            result = await client.complete({ modelId, system: systemText, messages, maxTokens: input.maxTokens, temperature: input.temperature })
        } catch (error) {
            logUsage({
                errorCode: 'AI_CHAT_FAILED',
                severity: 40,
                errorDescription: providerErrorMessage(error).slice(0, 500),
                details: { provider: session.provider, model: modelId, featureKey: session.featureKey, sessionId },
            })
            throw error
        }
        const durationMs = Date.now() - startedAt

        const userMessage = await sessionService.insertMessage({
            sessionId,
            role: 'user',
            content: input.content,
            modelId: null,
            inputTokens: null,
            outputTokens: null,
            durationMs: null,
        })
        if (input.attachmentIds?.length) await settleQuietly(attachmentService.attachToMessage(userId, input.attachmentIds, userMessage.id))
        const assistantMessage = await sessionService.insertMessage({
            sessionId,
            role: 'assistant',
            content: result.content,
            modelId: result.modelId,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            durationMs,
        })
        await settleQuietly(sessionService.touchLastMessage(sessionId))
        await settleQuietly(connectionService.touchUsed(row.id))

        logUsage({
            errorCode: 'AI_CHAT_COMPLETED',
            severity: 20,
            details: {
                provider: session.provider,
                model: result.modelId,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                durationMs,
                featureKey: session.featureKey,
                sessionId,
            },
        })

        return {
            id: assistantMessage.id,
            role: 'assistant' as const,
            content: result.content,
            modelId: result.modelId,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            durationMs,
        }
    }

    const complete = async (userId: string, input: AiCompletion) => {
        const { row, client } = await connectionService.resolveClient(userId, input.provider)
        const prompts = input.promptIds?.length ? await promptService.resolveOwned(userId, input.promptIds) : []
        const { systemText, seedMessages } = assemblePrompts(prompts)
        const systemFromInput = input.messages
            .filter((m) => m.role === 'system')
            .map((m) => m.content)
            .join('\n\n')
        const system = mergeSystem(systemText, systemFromInput)
        const messages: AiChatMessage[] = [
            ...seedMessages,
            ...input.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content })),
        ]

        const startedAt = Date.now()
        let result
        try {
            result = await client.complete({ modelId: input.modelId, system, messages, maxTokens: input.maxTokens, temperature: input.temperature })
        } catch (error) {
            logUsage({
                errorCode: 'AI_COMPLETION_FAILED',
                severity: 40,
                errorDescription: providerErrorMessage(error).slice(0, 500),
                details: { provider: input.provider, model: input.modelId, featureKey: input.featureKey },
            })
            throw error
        }
        const durationMs = Date.now() - startedAt

        await settleQuietly(connectionService.touchUsed(row.id))
        logUsage({
            errorCode: 'AI_COMPLETION_COMPLETED',
            severity: 20,
            details: {
                provider: input.provider,
                model: result.modelId,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                durationMs,
                featureKey: input.featureKey,
            },
        })

        return { content: result.content, modelId: result.modelId, inputTokens: result.inputTokens, outputTokens: result.outputTokens, durationMs }
    }

    return { send, complete }
}

export type AiChatService = ReturnType<typeof createAiChatService>
