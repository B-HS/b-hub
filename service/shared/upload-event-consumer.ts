import Redis from 'ioredis'

const STREAM_KEY = 'storage:upload:completed'
const GROUP_NAME = 'hyun-hub-consumers'
const CONSUMER_NAME = 'consumer-1'

type UploadEventData = {
    userId: string
    s3Key: string
    originalName: string
    mimeType: string
    sizeBytes: number
    fileHash: string
    folderId: string | null
    gdriveFileId: string | null
    localPath: string | null
    storageTiers: string
    thumbnailBase64: string | null
    uploadedAt: string
}

type InsertAssetData = {
    userId: string
    s3Key: string
    originalName: string
    mimeType: string
    sizeBytes: number
    fileHash: string
    folderId: string | null
    gdriveFileId: string | null
    localPath: string | null
    storageTiers: string
    thumbnailBlob: Buffer | null
    isPublic: boolean
    accessCount: number
}

type UploadEventConsumerDeps = {
    redisUrl: string
    insertAsset: (data: InsertAssetData) => Promise<{ id: number }>
    checkDuplicate: (userId: string, fileHash: string) => Promise<boolean>
    checkQuota: (userId: string, sizeBytes: number) => Promise<boolean>
}

const parseEventFields = (fields: string[]): UploadEventData => {
    const map: Record<string, string> = {}
    for (let i = 0; i < fields.length; i += 2) {
        map[fields[i]] = fields[i + 1]
    }
    return {
        userId: map.userId ?? '',
        s3Key: map.s3Key ?? '',
        originalName: map.originalName ?? '',
        mimeType: map.mimeType ?? '',
        sizeBytes: Number(map.sizeBytes ?? 0),
        fileHash: map.fileHash ?? '',
        folderId: map.folderId || null,
        gdriveFileId: map.gdriveFileId || null,
        localPath: map.localPath || null,
        storageTiers: map.storageTiers ?? '',
        thumbnailBase64: map.thumbnailBase64 || null,
        uploadedAt: map.uploadedAt ?? '',
    }
}

export const createUploadEventConsumer = (deps: UploadEventConsumerDeps) => {
    const redis = new Redis(deps.redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        lazyConnect: true,
    })

    const ensureGroup = async () => {
        try {
            await redis.xgroup('CREATE', STREAM_KEY, GROUP_NAME, '0', 'MKSTREAM')
        } catch (error) {
            if (error instanceof Error && !error.message.includes('BUSYGROUP')) {
                throw error
            }
        }
    }

    return {
        consume: async (maxCount = 100): Promise<number> => {
            await ensureGroup()

            const results = await redis.xreadgroup('GROUP', GROUP_NAME, CONSUMER_NAME, 'COUNT', maxCount, 'BLOCK', 0, 'STREAMS', STREAM_KEY, '>')

            if (!results || results.length === 0) return 0

            let processed = 0

            for (const [, messages] of results) {
                for (const [messageId, fields] of messages) {
                    try {
                        const event = parseEventFields(fields)

                        if (!event.userId || !event.s3Key || !event.fileHash) {
                            await redis.xack(STREAM_KEY, GROUP_NAME, messageId)
                            continue
                        }

                        const isDuplicate = await deps.checkDuplicate(event.userId, event.fileHash)
                        if (isDuplicate) {
                            await redis.xack(STREAM_KEY, GROUP_NAME, messageId)
                            continue
                        }

                        const hasQuota = await deps.checkQuota(event.userId, event.sizeBytes)
                        if (!hasQuota) {
                            await redis.xack(STREAM_KEY, GROUP_NAME, messageId)
                            continue
                        }

                        const thumbnailBlob = event.thumbnailBase64 ? Buffer.from(event.thumbnailBase64, 'base64') : null

                        await deps.insertAsset({
                            userId: event.userId,
                            s3Key: event.s3Key,
                            originalName: event.originalName,
                            mimeType: event.mimeType,
                            sizeBytes: event.sizeBytes,
                            fileHash: event.fileHash,
                            folderId: event.folderId,
                            gdriveFileId: event.gdriveFileId,
                            localPath: event.localPath,
                            storageTiers: event.storageTiers,
                            thumbnailBlob,
                            isPublic: false,
                            accessCount: 0,
                        })

                        await redis.xack(STREAM_KEY, GROUP_NAME, messageId)
                        processed++
                    } catch {
                        // ACK하지 않아 pending 상태 유지 → 재처리 가능
                    }
                }
            }

            return processed
        },

        disconnect: async () => {
            await redis.quit()
        },
    }
}

export type UploadEventConsumer = ReturnType<typeof createUploadEventConsumer>
export { STREAM_KEY, GROUP_NAME }
