import Redis from 'ioredis'

const STREAM_KEY = 'storage:upload:completed'

type UploadEvent = {
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

type RedisEventDeps = {
    redisUrl: string
}

export const createRedisEventPublisher = (deps: RedisEventDeps) => {
    const redis = new Redis(deps.redisUrl)

    return {
        publish: async (event: UploadEvent): Promise<string> => {
            const fields: string[] = []
            for (const [key, value] of Object.entries(event)) {
                fields.push(key, value === null ? '' : String(value))
            }
            return redis.xadd(STREAM_KEY, '*', ...fields)
        },

        disconnect: async () => {
            await redis.quit()
        },
    }
}

export type RedisEventPublisher = ReturnType<typeof createRedisEventPublisher>
export type { UploadEvent }
export { STREAM_KEY }
