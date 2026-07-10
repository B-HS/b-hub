import { describe, expect, test, mock } from 'bun:test'
import { createAiModelService } from '../../../../service/domain/ai/ai-model'
import type { AiModelUpsert } from '../../../../service/domain/ai/ai-model'
import type { AiModel, AiProvider } from '../../../../db/schema'
import type { AiModelInfo } from '../../../../service/domain/ai/ai-provider'

const HOUR_MS = 60 * 60 * 1000

const buildModel = (over: Partial<AiModel> = {}): AiModel => ({
    id: 1,
    providerId: 7,
    modelId: 'm1',
    displayName: 'Model 1',
    metadata: { a: 1 },
    fetchedAt: new Date(),
    createdAt: new Date(),
    ...over,
})

const buildProviderRow = (over: Partial<AiProvider> = {}) => ({ id: 7, modelsFetchedAt: null, ...over }) as AiProvider

const createClient = () => ({
    listModels: mock(async (): Promise<AiModelInfo[]> => [{ modelId: 'm1', displayName: 'Model 1', metadata: { a: 1 } }]),
    complete: mock(async () => ({ content: '', modelId: 'm1', inputTokens: null, outputTokens: null })),
    verify: mock(async () => ({ ok: true })),
})

const createDeps = (row: AiProvider = buildProviderRow()) => {
    const client = createClient()
    const db = {
        listByProvider: mock(async (_providerId: number) => [buildModel()]),
        replaceForProvider: mock(async (_providerId: number, _models: AiModelUpsert[]) => {}),
    }
    const connectionService = {
        resolveClient: mock(async (_userId: string, _provider: string) => ({ row, client })),
        touchModelsFetched: mock(async (_id: number) => {}),
    }
    return { client, db, connectionService }
}

describe('createAiModelService', () => {
    test('listCached는 캐시가 신선하면 프로바이더 fetch 없이 캐시를 반환한다', async () => {
        const { client, db, connectionService } = createDeps(buildProviderRow({ modelsFetchedAt: new Date() }))
        const service = createAiModelService({ db: db as never, connectionService: connectionService as never })

        const result = await service.listCached('user-1', 'anthropic')

        expect(connectionService.resolveClient).toHaveBeenCalledWith('user-1', 'anthropic')
        expect(db.listByProvider).toHaveBeenCalledWith(7)
        expect(client.listModels).not.toHaveBeenCalled()
        expect(result).toHaveLength(1)
    })

    test('listCached는 modelsFetchedAt이 없으면 프로바이더에서 새로 가져와 저장한다', async () => {
        const { client, db, connectionService } = createDeps(buildProviderRow({ modelsFetchedAt: null }))
        const service = createAiModelService({ db: db as never, connectionService: connectionService as never })

        const result = await service.listCached('user-1', 'codex')

        expect(client.listModels).toHaveBeenCalled()
        expect(db.replaceForProvider).toHaveBeenCalledWith(7, [{ modelId: 'm1', displayName: 'Model 1', metadata: { a: 1 } }])
        expect(connectionService.touchModelsFetched).toHaveBeenCalledWith(7)
        expect(result).toHaveLength(1)
    })

    test('listCached는 TTL이 지난 캐시를 자동 갱신한다', async () => {
        const staleFetchedAt = new Date(Date.now() - 25 * HOUR_MS)
        const { client, db, connectionService } = createDeps(buildProviderRow({ modelsFetchedAt: staleFetchedAt }))
        const service = createAiModelService({ db: db as never, connectionService: connectionService as never })

        await service.listCached('user-1', 'codex')

        expect(client.listModels).toHaveBeenCalled()
        expect(connectionService.touchModelsFetched).toHaveBeenCalledWith(7)
    })

    test('listCached는 갱신 실패 시 기존 캐시를 그대로 반환한다', async () => {
        const { client, db, connectionService } = createDeps(buildProviderRow({ modelsFetchedAt: null }))
        client.listModels.mockRejectedValueOnce(new Error('upstream down'))
        const service = createAiModelService({ db: db as never, connectionService: connectionService as never })

        const result = await service.listCached('user-1', 'codex')

        expect(db.replaceForProvider).not.toHaveBeenCalled()
        expect(result).toHaveLength(1)
    })

    test('refresh는 client.listModels 결과로 replaceForProvider·touchModelsFetched를 호출하고 최신 목록을 반환한다', async () => {
        const { client, db, connectionService } = createDeps()
        const service = createAiModelService({ db: db as never, connectionService: connectionService as never })

        const result = await service.refresh('user-1', 'anthropic')

        expect(client.listModels).toHaveBeenCalled()
        expect(db.replaceForProvider).toHaveBeenCalledWith(7, [{ modelId: 'm1', displayName: 'Model 1', metadata: { a: 1 } }])
        expect(connectionService.touchModelsFetched).toHaveBeenCalledWith(7)
        expect(db.listByProvider).toHaveBeenCalledWith(7)
        expect(result).toHaveLength(1)
    })

    test('refresh는 프로바이더 fetch 실패를 그대로 던진다', async () => {
        const { client, db, connectionService } = createDeps()
        client.listModels.mockRejectedValueOnce(new Error('upstream down'))
        const service = createAiModelService({ db: db as never, connectionService: connectionService as never })

        await expect(service.refresh('user-1', 'anthropic')).rejects.toThrow('upstream down')
        expect(db.replaceForProvider).not.toHaveBeenCalled()
    })
})
