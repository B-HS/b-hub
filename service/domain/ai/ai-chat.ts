import type { AiMessage, AiPrompt } from '../../../db/schema'
import type { AiConnectionService } from './ai-connection'
import type { AiPromptService } from './ai-prompt'
import type { AiSessionService } from './ai-session'
import type { AiAttachmentService } from './ai-attachment'
import type { AiChatMessage, AiCompletionResult, AiStreamEvent } from './ai-provider'
import { providerErrorMessage } from './ai-provider'
import { createAppError } from '../../../lib/error'
import type { AiChatSend, AiCompletion } from '../../../dto/ai/chat'

const HISTORY_LIMIT = 50

export type AiUsageLogger = (entry: { errorCode: string; severity: number; errorDescription?: string; details: Record<string, unknown> }) => void

export type AiChatStreamDone = {
    id?: number
    content: string
    modelId: string
    inputTokens: number | null
    outputTokens: number | null
    durationMs: number
}

export type AiChatStreamEvent = { type: 'delta'; text: string } | { type: 'done'; result: AiChatStreamDone }

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
    const prepareSend = async (userId: string, sessionId: string, input: AiChatSend) => {
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
        return { session, row, client, modelId, system: systemText, messages }
    }

    const prepareCompletion = async (userId: string, input: AiCompletion) => {
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
        return { row, client, system, messages }
    }

    const logSendFailure = (error: unknown, detail: { provider: string; modelId: string; featureKey: string | null; sessionId: string }) =>
        logUsage({
            errorCode: 'AI_CHAT_FAILED',
            severity: 40,
            errorDescription: providerErrorMessage(error).slice(0, 500),
            details: { provider: detail.provider, model: detail.modelId, featureKey: detail.featureKey, sessionId: detail.sessionId },
        })

    const logCompletionFailure = (error: unknown, detail: { provider: string; modelId: string; featureKey?: string }) =>
        logUsage({
            errorCode: 'AI_COMPLETION_FAILED',
            severity: 40,
            errorDescription: providerErrorMessage(error).slice(0, 500),
            details: { provider: detail.provider, model: detail.modelId, featureKey: detail.featureKey },
        })

    const persistSendResult = async (args: {
        userId: string
        sessionId: string
        input: AiChatSend
        session: { provider: string; featureKey: string | null }
        rowId: number
        result: AiCompletionResult
        durationMs: number
    }) => {
        const { userId, sessionId, input, session, rowId, result, durationMs } = args
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
        await settleQuietly(connectionService.touchUsed(rowId))

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
        return assistantMessage
    }

    const finalizeCompletion = async (args: {
        provider: string
        featureKey?: string
        rowId: number
        result: AiCompletionResult
        durationMs: number
    }) => {
        const { provider, featureKey, rowId, result, durationMs } = args
        await settleQuietly(connectionService.touchUsed(rowId))
        logUsage({
            errorCode: 'AI_COMPLETION_COMPLETED',
            severity: 20,
            details: {
                provider,
                model: result.modelId,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                durationMs,
                featureKey,
            },
        })
    }

    const relayDeltas = async function* (upstream: AsyncIterable<AiStreamEvent>): AsyncGenerator<AiChatStreamEvent, AiCompletionResult> {
        let latest: AiCompletionResult | null = null
        for await (const event of upstream) {
            if (event.type === 'delta') yield { type: 'delta', text: event.text }
            else latest = event.result
        }
        if (!latest) throw createAppError('AI_COMPLETION_FAILED', { detail: 'stream ended without completion' })
        return latest
    }

    const send = async (userId: string, sessionId: string, input: AiChatSend) => {
        const { session, row, client, modelId, system, messages } = await prepareSend(userId, sessionId, input)

        const startedAt = Date.now()
        let result
        try {
            result = await client.complete({ modelId, system, messages, maxTokens: input.maxTokens, temperature: input.temperature })
        } catch (error) {
            logSendFailure(error, { provider: session.provider, modelId, featureKey: session.featureKey, sessionId })
            throw error
        }
        const durationMs = Date.now() - startedAt

        const assistantMessage = await persistSendResult({ userId, sessionId, input, session, rowId: row.id, result, durationMs })

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

    const sendStream = async (userId: string, sessionId: string, input: AiChatSend) => {
        const { session, row, client, modelId, system, messages } = await prepareSend(userId, sessionId, input)

        const startedAt = Date.now()
        let upstream: AsyncIterable<AiStreamEvent>
        try {
            upstream = await client.completeStream({ modelId, system, messages, maxTokens: input.maxTokens, temperature: input.temperature })
        } catch (error) {
            logSendFailure(error, { provider: session.provider, modelId, featureKey: session.featureKey, sessionId })
            throw error
        }

        return (async function* () {
            let result: AiCompletionResult
            try {
                result = yield* relayDeltas(upstream)
            } catch (error) {
                logSendFailure(error, { provider: session.provider, modelId, featureKey: session.featureKey, sessionId })
                throw error
            }
            const durationMs = Date.now() - startedAt

            const assistantMessage = await persistSendResult({ userId, sessionId, input, session, rowId: row.id, result, durationMs })

            yield {
                type: 'done' as const,
                result: {
                    id: assistantMessage.id,
                    content: result.content,
                    modelId: result.modelId,
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                    durationMs,
                },
            }
        })()
    }

    const complete = async (userId: string, input: AiCompletion) => {
        const { row, client, system, messages } = await prepareCompletion(userId, input)

        const startedAt = Date.now()
        let result
        try {
            result = await client.complete({ modelId: input.modelId, system, messages, maxTokens: input.maxTokens, temperature: input.temperature })
        } catch (error) {
            logCompletionFailure(error, { provider: input.provider, modelId: input.modelId, featureKey: input.featureKey })
            throw error
        }
        const durationMs = Date.now() - startedAt

        await finalizeCompletion({ provider: input.provider, featureKey: input.featureKey, rowId: row.id, result, durationMs })

        return { content: result.content, modelId: result.modelId, inputTokens: result.inputTokens, outputTokens: result.outputTokens, durationMs }
    }

    const completeStream = async (userId: string, input: AiCompletion) => {
        const { row, client, system, messages } = await prepareCompletion(userId, input)

        const startedAt = Date.now()
        let upstream: AsyncIterable<AiStreamEvent>
        try {
            upstream = await client.completeStream({
                modelId: input.modelId,
                system,
                messages,
                maxTokens: input.maxTokens,
                temperature: input.temperature,
            })
        } catch (error) {
            logCompletionFailure(error, { provider: input.provider, modelId: input.modelId, featureKey: input.featureKey })
            throw error
        }

        return (async function* () {
            let result: AiCompletionResult
            try {
                result = yield* relayDeltas(upstream)
            } catch (error) {
                logCompletionFailure(error, { provider: input.provider, modelId: input.modelId, featureKey: input.featureKey })
                throw error
            }
            const durationMs = Date.now() - startedAt

            await finalizeCompletion({ provider: input.provider, featureKey: input.featureKey, rowId: row.id, result, durationMs })

            yield {
                type: 'done' as const,
                result: {
                    content: result.content,
                    modelId: result.modelId,
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                    durationMs,
                },
            }
        })()
    }

    return { send, sendStream, complete, completeStream }
}

export type AiChatService = ReturnType<typeof createAiChatService>
