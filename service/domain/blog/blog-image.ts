import { createHmac } from 'crypto'
import { createAppError } from '../../../lib/error'

type ImageListItem = {
    id: string
    r2Key: string
    url: string
    mimeType: string
    sizeBytes: number
    width: number | null
    height: number | null
    createdAt: string
}

type PrepareResult = {
    assetId: string
    s3Key: string
    uploadToken: string
    uploadUrl: string
    expiresAt: number
}

type CompleteResult = {
    id: string
    url: string
    mimeType: string
    sizeBytes: number
    width: number | null
    height: number | null
}

type StorageService = {
    getUrl: (key: string) => string
    delete: (key: string) => Promise<void>
}

type BlogImageDb = {
    insertImageAsset: (data: {
        id: string
        r2Key: string
        bucket: string
        mimeType: string
        sizeBytes: number
        width: number | null
        height: number | null
        checksum: string | null
        uploadedBy: string
    }) => Promise<void>
    getImageList: () => Promise<ImageListItem[]>
    getImageAssetById: (id: string) => Promise<{ r2Key: string } | null>
    deleteImageAsset: (id: string) => Promise<void>
}

type BlogImageDeps = {
    storage: StorageService
    db: BlogImageDb
    bucket: string
    generateId: () => string
    tokenSecret: string
    uploadServerUrl: string
}

const TOKEN_TTL_MS = 10 * 60 * 1000

const signToken = (secret: string, assetId: string, s3Key: string, userId: string, expiresAt: number): string => {
    const payload = `${assetId}.${s3Key}.${userId}.${expiresAt}`
    const sig = createHmac('sha256', secret).update(payload).digest('base64url')
    const userIdB64 = Buffer.from(userId).toString('base64url')
    return `${expiresAt}.${userIdB64}.${sig}`
}

const verifyToken = (secret: string, token: string, assetId: string, s3Key: string): { ok: false } | { ok: true; userId: string } => {
    const parts = token.split('.')
    if (parts.length !== 3) return { ok: false }
    const [tsStr, userIdB64, sig] = parts
    const expiresAt = Number(tsStr)
    if (!Number.isFinite(expiresAt)) return { ok: false }
    if (Date.now() > expiresAt) return { ok: false }
    let userId: string
    try {
        userId = Buffer.from(userIdB64, 'base64url').toString('utf8')
    } catch {
        return { ok: false }
    }
    const expected = createHmac('sha256', secret).update(`${assetId}.${s3Key}.${userId}.${expiresAt}`).digest('base64url')
    if (expected.length !== sig.length) return { ok: false }
    let diff = 0
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
    if (diff !== 0) return { ok: false }
    return { ok: true, userId }
}

const requireTokenSecret = (secret: string) => {
    if (!secret) throw createAppError('SERVICE_NOT_CONFIGURED')
    return secret
}

export const createBlogImageService = (deps: BlogImageDeps) => ({
    prepare: (userId: string): PrepareResult => {
        const tokenSecret = requireTokenSecret(deps.tokenSecret)
        const assetId = deps.generateId()
        const s3Key = `${assetId}.webp`
        const expiresAt = Date.now() + TOKEN_TTL_MS
        const uploadToken = signToken(tokenSecret, assetId, s3Key, userId, expiresAt)
        return { assetId, s3Key, uploadToken, uploadUrl: deps.uploadServerUrl, expiresAt }
    },

    complete: async (data: {
        assetId: string
        s3Key: string
        uploadToken: string
        sizeBytes: number
        width: number | null
        height: number | null
    }): Promise<CompleteResult> => {
        const result = verifyToken(requireTokenSecret(deps.tokenSecret), data.uploadToken, data.assetId, data.s3Key)
        if (!result.ok) throw createAppError('UNAUTHORIZED')

        const expectedS3Key = `${data.assetId}.webp`
        if (data.s3Key !== expectedS3Key) throw createAppError('VALIDATION_ERROR')

        await deps.db.insertImageAsset({
            id: data.assetId,
            r2Key: data.s3Key,
            bucket: deps.bucket,
            mimeType: 'image/webp',
            sizeBytes: data.sizeBytes,
            width: data.width,
            height: data.height,
            checksum: null,
            uploadedBy: result.userId,
        })

        return {
            id: data.assetId,
            url: deps.storage.getUrl(data.s3Key),
            mimeType: 'image/webp',
            sizeBytes: data.sizeBytes,
            width: data.width,
            height: data.height,
        }
    },

    getList: async (): Promise<ImageListItem[]> => {
        return deps.db.getImageList()
    },

    delete: async (id: string): Promise<void> => {
        const asset = await deps.db.getImageAssetById(id)
        if (!asset) throw createAppError('NOT_FOUND')
        const allowedKeys = [`${id}.webp`, `blog/${id}.webp`]
        if (!allowedKeys.includes(asset.r2Key)) throw createAppError('FORBIDDEN')

        await deps.storage.delete(asset.r2Key)
        await deps.db.deleteImageAsset(id)
    },
})

export type BlogImageService = ReturnType<typeof createBlogImageService>
