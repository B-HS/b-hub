import type { AiSession, AiMessage } from '../../../db/schema'
import type { AiSessionCreate, AiSessionUpdate, AiSessionListQuery } from '../../../dto/ai/session'
import type { AiMessageListQuery } from '../../../dto/ai/chat'
import { createAppError } from '../../../lib/error'

export type AiSessionInsert = {
    id: string
    userId: string
    providerId: number | null
    provider: string
    modelId: string
    title: string | null
    featureKey: string | null
    promptIds: number[] | null
}

export type AiSessionUpdateData = {
    title?: string | null
    modelId?: string
    promptIds?: number[] | null
}

export type AiMessageInsert = {
    sessionId: string
    role: string
    content: string
    modelId: string | null
    inputTokens: number | null
    outputTokens: number | null
    durationMs: number | null
}

export type AiSessionServiceDb = {
    listByUser: (userId: string, filter: AiSessionListQuery) => Promise<{ rows: AiSession[]; total: number }>
    getById: (id: string) => Promise<AiSession | null>
    insert: (data: AiSessionInsert) => Promise<void>
    update: (id: string, data: AiSessionUpdateData) => Promise<void>
    remove: (id: string) => Promise<void>
    touchLastMessage: (id: string) => Promise<void>
    listMessages: (sessionId: string, filter: AiMessageListQuery) => Promise<{ rows: AiMessage[]; total: number }>
    listRecentMessages: (sessionId: string, limit: number) => Promise<AiMessage[]>
    insertMessage: (data: AiMessageInsert) => Promise<{ id: number }>
}

type AiSessionDeps = {
    db: AiSessionServiceDb
    generateId: () => string
}

export const createAiSessionService = ({ db, generateId }: AiSessionDeps) => {
    const list = async (userId: string, filter: AiSessionListQuery) => db.listByUser(userId, filter)

    const getOwned = async (userId: string, id: string) => {
        const row = await db.getById(id)
        if (!row || row.userId !== userId) throw createAppError('AI_SESSION_NOT_FOUND')
        return row
    }

    const create = async (userId: string, input: AiSessionCreate, providerId: number | null) => {
        const id = generateId()
        await db.insert({
            id,
            userId,
            providerId,
            provider: input.provider,
            modelId: input.modelId,
            title: input.title ?? null,
            featureKey: input.featureKey ?? null,
            promptIds: input.promptIds ?? null,
        })
        return getOwned(userId, id)
    }

    const update = async (userId: string, id: string, input: AiSessionUpdate) => {
        await getOwned(userId, id)
        await db.update(id, input)
        return getOwned(userId, id)
    }

    const remove = async (userId: string, id: string) => {
        await getOwned(userId, id)
        await db.remove(id)
    }

    const listMessages = async (userId: string, id: string, filter: AiMessageListQuery) => {
        await getOwned(userId, id)
        return db.listMessages(id, filter)
    }

    return {
        list,
        getOwned,
        create,
        update,
        remove,
        listMessages,
        listRecentMessages: db.listRecentMessages,
        insertMessage: db.insertMessage,
        touchLastMessage: db.touchLastMessage,
    }
}

export type AiSessionService = ReturnType<typeof createAiSessionService>
