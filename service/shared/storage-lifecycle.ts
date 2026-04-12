type StorageLifecycleDb = {
    getStaleL1Assets: (olderThan: Date) => Promise<{ id: number; s3Key: string; storageTiers: string }[]>
    getPromotionCandidates: (minAccessCount: number, maxSizeBytes: number) => Promise<{ id: number; s3Key: string; gdriveFileId: string; storageTiers: string; mimeType: string }[]>
    updateStorageTiers: (id: number, storageTiers: string) => Promise<void>
    insertLifecycleLog: (data: { assetId: number; action: string; fromTier: string; toTier: string; reason: string }) => Promise<void>
}

type L1Storage = {
    del: (key: string) => Promise<void>
    upload: (key: string, body: Buffer | Uint8Array, contentType: string) => Promise<{ key: string; url: string }>
}

type L3Storage = {
    download: (gdriveFileId: string) => Promise<ReadableStream>
}

type StorageLifecycleDeps = {
    db: StorageLifecycleDb
    l1: L1Storage
    l3: L3Storage | null
    evictionDays: number
    promotionThreshold: number
    l1MaxFileSize: number
}

const removeTier = (tiers: string, tier: string): string =>
    tiers
        .split(',')
        .filter((t) => t !== tier)
        .join(',')

const addTier = (tiers: string, tier: string): string => {
    const set = new Set(tiers.split(',').filter(Boolean))
    set.add(tier)
    return [...set].sort().join(',')
}

const streamToBuffer = async (stream: ReadableStream): Promise<Buffer> => {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let done = false
    while (!done) {
        const result = await reader.read()
        if (result.value) chunks.push(result.value)
        done = result.done
    }
    return Buffer.concat(chunks)
}

export const createStorageLifecycleService = (deps: StorageLifecycleDeps) => ({
    evictR2Stale: async (): Promise<number> => {
        const cutoff = new Date(Date.now() - deps.evictionDays * 24 * 60 * 60 * 1000)
        const staleAssets = await deps.db.getStaleL1Assets(cutoff)

        let evicted = 0
        for (const asset of staleAssets) {
            try {
                await deps.l1.del(asset.s3Key)
                const newTiers = removeTier(asset.storageTiers, 'L1')
                await deps.db.updateStorageTiers(asset.id, newTiers)
                await deps.db.insertLifecycleLog({
                    assetId: asset.id,
                    action: 'evict_l1',
                    fromTier: 'L1',
                    toTier: newTiers,
                    reason: `${deps.evictionDays}일 미접근`,
                })
                evicted++
            } catch {}
        }

        return evicted
    },

    evictLocalFifo: async (): Promise<number> => {
        return 0
    },

    autoPromote: async (): Promise<number> => {
        if (!deps.l3) return 0

        const candidates = await deps.db.getPromotionCandidates(deps.promotionThreshold, deps.l1MaxFileSize)

        let promoted = 0
        for (const asset of candidates) {
            try {
                const stream = await deps.l3.download(asset.gdriveFileId)
                const buffer = await streamToBuffer(stream)
                await deps.l1.upload(asset.s3Key, buffer, asset.mimeType)
                const newTiers = addTier(asset.storageTiers, 'L1')
                await deps.db.updateStorageTiers(asset.id, newTiers)
                await deps.db.insertLifecycleLog({
                    assetId: asset.id,
                    action: 'promote_l1',
                    fromTier: asset.storageTiers,
                    toTier: newTiers,
                    reason: `accessCount >= ${deps.promotionThreshold}`,
                })
                promoted++
            } catch {}
        }

        return promoted
    },
})

export type StorageLifecycleService = ReturnType<typeof createStorageLifecycleService>
