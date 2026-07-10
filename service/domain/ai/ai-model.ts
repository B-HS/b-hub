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

type ResolvedClient = Awaited<ReturnType<AiConnectionService['resolveClient']>>

const MODELS_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export const createAiModelService = ({ db, connectionService }: AiModelDeps) => {
    const fetchAndStore = async ({ row, client }: ResolvedClient) => {
        const models = await client.listModels()
        await db.replaceForProvider(
            row.id,
            models.map((m) => ({ modelId: m.modelId, displayName: m.displayName, metadata: m.metadata })),
        )
        await connectionService.touchModelsFetched(row.id)
        return db.listByProvider(row.id)
    }

    const listCached = async (userId: string, provider: string) => {
        const resolved = await connectionService.resolveClient(userId, provider)
        const cached = await db.listByProvider(resolved.row.id)
        const fetchedAt = resolved.row.modelsFetchedAt
        const isFresh = !!fetchedAt && Date.now() - fetchedAt.getTime() < MODELS_CACHE_TTL_MS
        if (isFresh && cached.length > 0) return cached
        try {
            return await fetchAndStore(resolved)
        } catch {
            return cached
        }
    }

    const refresh = async (userId: string, provider: string) => {
        const resolved = await connectionService.resolveClient(userId, provider)
        return fetchAndStore(resolved)
    }

    return { listCached, refresh }
}

export type AiModelService = ReturnType<typeof createAiModelService>
