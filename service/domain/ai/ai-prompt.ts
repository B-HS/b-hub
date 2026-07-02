import type { AiPrompt } from '../../../db/schema'
import type { AiPromptCreate, AiPromptUpdate, AiPromptListQuery } from '../../../dto/ai/prompt'
import { createAppError } from '../../../lib/error'

export type AiPromptInsert = {
    userId: string
    name: string
    description: string | null
    stage: string
    content: string
    featureKey: string | null
    sortOrder: number
    isActive: boolean
}

export type AiPromptUpdateData = {
    name?: string
    description?: string | null
    stage?: string
    content?: string
    featureKey?: string | null
    sortOrder?: number
    isActive?: boolean
}

export type AiPromptServiceDb = {
    listByUser: (userId: string, filter: AiPromptListQuery) => Promise<AiPrompt[]>
    getById: (id: number) => Promise<AiPrompt | null>
    getByIds: (ids: number[]) => Promise<AiPrompt[]>
    insert: (data: AiPromptInsert) => Promise<{ id: number }>
    update: (id: number, data: AiPromptUpdateData) => Promise<void>
    remove: (id: number) => Promise<void>
}

type AiPromptDeps = {
    db: AiPromptServiceDb
}

export const createAiPromptService = ({ db }: AiPromptDeps) => {
    const list = async (userId: string, filter: AiPromptListQuery) => db.listByUser(userId, filter)

    const getOwned = async (userId: string, id: number) => {
        const row = await db.getById(id)
        if (!row || row.userId !== userId) throw createAppError('AI_PROMPT_NOT_FOUND')
        return row
    }

    const resolveOwned = async (userId: string, ids: number[]) => {
        if (ids.length === 0) return []
        const rows = await db.getByIds([...new Set(ids)])
        if (rows.some((r) => r.userId !== userId)) throw createAppError('AI_PROMPT_NOT_FOUND')
        return rows
    }

    const create = async (userId: string, input: AiPromptCreate) => {
        const { id } = await db.insert({
            userId,
            name: input.name,
            description: input.description ?? null,
            stage: input.stage,
            content: input.content,
            featureKey: input.featureKey ?? null,
            sortOrder: input.sortOrder,
            isActive: input.isActive,
        })
        return getOwned(userId, id)
    }

    const update = async (userId: string, id: number, input: AiPromptUpdate) => {
        await getOwned(userId, id)
        await db.update(id, input)
        return getOwned(userId, id)
    }

    const remove = async (userId: string, id: number) => {
        await getOwned(userId, id)
        await db.remove(id)
    }

    return { list, getOwned, resolveOwned, create, update, remove }
}

export type AiPromptService = ReturnType<typeof createAiPromptService>
