import type { AiModel } from '../../../db/schema'
import type { AiConnectionService } from './ai-connection'

export type AiModelUpsert = {
    modelId: string
    displayName: string | null
    metadata: Record<string, unknown> | null
}

export type AiModelServiceDb = {
    listByProvider: (providerId: number) => Promise<AiModel[]>
    replaceForProvider: (providerId: number, models: AiModelUpsert[]) => Promise<void>
}

type AiModelDeps = {
    db: AiModelServiceDb
    connectionService: AiConnectionService
}

export const createAiModelService = ({ db, connectionService }: AiModelDeps) => {
    const listCached = async (userId: string, provider: string) => {
        const { row } = await connectionService.resolveClient(userId, provider)
        return db.listByProvider(row.id)
    }

    const refresh = async (userId: string, provider: string) => {
        const { row, client } = await connectionService.resolveClient(userId, provider)
        const models = await client.listModels()
        await db.replaceForProvider(
            row.id,
            models.map((m) => ({ modelId: m.modelId, displayName: m.displayName, metadata: m.metadata })),
        )
        await connectionService.touchModelsFetched(row.id)
        return db.listByProvider(row.id)
    }

    return { listCached, refresh }
}

export type AiModelService = ReturnType<typeof createAiModelService>
