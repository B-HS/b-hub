import { createAppError } from '../../../lib/error'
import { sanitizeFilename } from '../../../lib/mail-utils'

type DriveStorageService = {
    upload: (key: string, body: Buffer | Uint8Array, contentType: string) => Promise<{ key: string; url: string }>
    del: (key: string) => Promise<void>
    getUrl: (key: string) => string
    getPresignedUrl: (key: string, expiresIn?: number) => Promise<string>
}

type DriveGdriveService = {
    download: (gdriveFileId: string) => Promise<ReadableStream>
    del: (gdriveFileId: string) => Promise<void>
}

type DriveImageProcessor = {
    resize: (buffer: Buffer, width: number, height?: number) => Promise<Buffer>
    toWebp: (buffer: Buffer, quality?: number) => Promise<Buffer>
}

type UploadStatus = 'preparing' | 'uploading' | 'ready' | 'failed'

type DriveAssetRow = {
    id: number
    userId: string
    s3Key: string
    originalName: string
    mimeType: string
    sizeBytes: number
    fileHash: string
    folderId: string | null
    thumbnailBlob: Buffer | null
    isPublic: boolean
    uploadStatus: string
    uploadToken: string | null
    localPath: string | null
    gdriveFileId: string | null
    storageTiers: string
    accessCount: number
    lastViewedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

type DriveAssetServiceDb = {
    insert: (data: {
        userId: string
        s3Key: string
        originalName: string
        mimeType: string
        sizeBytes: number
        fileHash: string
        folderId: string | null
        thumbnailBlob: Buffer | null
        isPublic: boolean
        uploadStatus: string
        uploadToken: string | null
        localPath: string | null
        gdriveFileId: string | null
        storageTiers: string
        accessCount: number
    }) => Promise<{ id: number }>
    getById: (id: number) => Promise<DriveAssetRow | null>
    getByUserAndHash: (userId: string, fileHash: string) => Promise<DriveAssetRow | null>
    list: (params: {
        userId: string
        limit: number
        offset: number
        mimeType?: string
        folderId?: string
        sort: string
        order: string
    }) => Promise<{ data: DriveAssetRow[]; total: number }>
    update: (
        id: number,
        data: Partial<{
            originalName: string
            isPublic: boolean
            folderId: string | null
            lastViewedAt: Date
            accessCount: number
            storageTiers: string
            uploadStatus: string
            uploadToken: string | null
            localPath: string | null
            gdriveFileId: string | null
            thumbnailBlob: Buffer | null
        }>,
    ) => Promise<void>
    remove: (id: number) => Promise<void>
    getTotalSizeByUser: (userId: string) => Promise<number>
}

type DriveFolderChecker = {
    getById: (id: string) => Promise<{ id: string; userId: string } | null>
}

type DriveAssetServiceDeps = {
    storage: DriveStorageService
    gdriveStorage: DriveGdriveService | null
    imageProcessor: DriveImageProcessor
    db: DriveAssetServiceDb
    folderDb: DriveFolderChecker
    generateId: () => string
    defaultQuotaBytes: number
    getUserQuotaBytes: (userId: string) => Promise<number>
    uploadServerSecret: string
}

const MAX_FILE_SIZE = 100 * 1024 * 1024

const IMAGE_MIME_PREFIX = 'image/'

const MIME_TYPE_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/

const BLOCKED_MIME_TYPES = new Set([
    'application/x-msdownload',
    'application/x-executable',
    'application/x-msdos-program',
    'application/x-sh',
    'application/x-bat',
    'application/x-csh',
    'text/html',
    'application/javascript',
    'application/x-msi',
    'application/hta',
    'application/x-ms-shortcut',
])

const BLOCKED_EXTENSIONS = new Set(['.exe', '.bat', '.cmd', '.scr', '.msi', '.pif', '.vbs', '.js', '.ps1', '.sh', '.com'])

const MAGIC_BYTES: Record<string, number[][]> = {
    'image/jpeg': [[0xff, 0xd8, 0xff]],
    'image/png': [[0x89, 0x50, 0x4e, 0x47]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]],
}

const computeHash = async (buffer: Buffer) => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', new Uint8Array(buffer))
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

const normalizeMimeType = (mimeType: string) => mimeType.split(';')[0].trim().toLowerCase()

const validateMimeAndExtension = (fileName: string, mimeType: string) => {
    const normalized = normalizeMimeType(mimeType)

    if (!MIME_TYPE_REGEX.test(normalized)) {
        throw createAppError('DRIVE_INVALID_MIME_TYPE')
    }

    if (BLOCKED_MIME_TYPES.has(normalized)) {
        throw createAppError('DRIVE_INVALID_MIME_TYPE')
    }

    const extMatch = fileName.match(/(\.[^.]+)$/)
    if (extMatch && BLOCKED_EXTENSIONS.has(extMatch[1].toLowerCase())) {
        throw createAppError('DRIVE_INVALID_MIME_TYPE')
    }
}

const validateMagicBytes = (buffer: Buffer, mimeType: string) => {
    const signatures = MAGIC_BYTES[mimeType]
    if (signatures) {
        const matches = signatures.some((sig) => sig.every((byte, i) => buffer[i] === byte))
        if (!matches) {
            throw createAppError('DRIVE_INVALID_MIME_TYPE')
        }
    }
}

const parseTiers = (storageTiers: string): Set<string> => new Set(storageTiers.split(',').filter(Boolean))

const generateToken = () => {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

export const createDriveAssetService = (deps: DriveAssetServiceDeps) => ({
    upload: async (file: File, userId: string, folderId?: string) => {
        if (file.size > MAX_FILE_SIZE) {
            throw createAppError('DRIVE_FILE_TOO_LARGE')
        }

        const safeName = sanitizeFilename(file.name)
        validateMimeAndExtension(safeName, file.type)

        const resolvedFolderId = folderId ?? null
        if (resolvedFolderId) {
            const folder = await deps.folderDb.getById(resolvedFolderId)
            if (!folder || folder.userId !== userId) throw createAppError('DRIVE_FOLDER_NOT_FOUND')
        }

        const buffer = Buffer.from(await file.arrayBuffer())

        if (buffer.length > MAX_FILE_SIZE) {
            throw createAppError('DRIVE_FILE_TOO_LARGE')
        }

        if (file.type.startsWith(IMAGE_MIME_PREFIX)) {
            validateMagicBytes(buffer, file.type)
        }

        const fileHash = await computeHash(buffer)

        const existing = await deps.db.getByUserAndHash(userId, fileHash)
        if (existing) {
            throw createAppError('DRIVE_DUPLICATE_FILE')
        }

        const quotaBytes = await deps.getUserQuotaBytes(userId)
        const currentUsage = await deps.db.getTotalSizeByUser(userId)
        if (currentUsage + file.size > quotaBytes) {
            throw createAppError('DRIVE_QUOTA_EXCEEDED')
        }

        let thumbnailBlob: Buffer | null = null
        if (file.type.startsWith(IMAGE_MIME_PREFIX)) {
            try {
                const resized = await deps.imageProcessor.resize(buffer, 100, 100)
                thumbnailBlob = await deps.imageProcessor.toWebp(resized, 60)
            } catch {
                thumbnailBlob = null
            }
        }

        const id = deps.generateId()
        const s3Key = `users/${userId}/${id}/${safeName}`
        await deps.storage.upload(s3Key, buffer, file.type)

        let result
        try {
            result = await deps.db.insert({
                userId,
                s3Key,
                originalName: safeName,
                mimeType: file.type,
                sizeBytes: file.size,
                fileHash,
                folderId: resolvedFolderId,
                thumbnailBlob,
                isPublic: false,
                uploadStatus: 'ready',
                uploadToken: null,
                localPath: null,
                gdriveFileId: null,
                storageTiers: 'L1',
                accessCount: 0,
            })
        } catch (error) {
            try {
                await deps.storage.del(s3Key)
            } catch {}
            throw error
        }

        return {
            id: result.id,
            s3Key,
            originalName: safeName,
            mimeType: file.type,
            sizeBytes: file.size,
            folderId: resolvedFolderId,
            isPublic: false,
            storageTiers: 'L1',
            uploadStatus: 'ready' as UploadStatus,
            url: deps.storage.getUrl(s3Key),
        }
    },

    prepare: async (userId: string, data: { originalName: string; mimeType: string; sizeBytes: number; folderId: string | null }) => {
        const safeName = sanitizeFilename(data.originalName)
        validateMimeAndExtension(safeName, data.mimeType)

        if (data.folderId) {
            const folder = await deps.folderDb.getById(data.folderId)
            if (!folder || folder.userId !== userId) throw createAppError('DRIVE_FOLDER_NOT_FOUND')
        }

        const quotaBytes = await deps.getUserQuotaBytes(userId)
        const currentUsage = await deps.db.getTotalSizeByUser(userId)
        if (currentUsage + data.sizeBytes > quotaBytes) {
            throw createAppError('DRIVE_QUOTA_EXCEEDED')
        }

        const id = deps.generateId()
        const s3Key = `users/${userId}/${id}/${safeName}`
        const uploadToken = generateToken()

        const result = await deps.db.insert({
            userId,
            s3Key,
            originalName: safeName,
            mimeType: data.mimeType,
            sizeBytes: data.sizeBytes,
            fileHash: '',
            folderId: data.folderId,
            thumbnailBlob: null,
            isPublic: false,
            uploadStatus: 'preparing',
            uploadToken,
            localPath: null,
            gdriveFileId: null,
            storageTiers: '',
            accessCount: 0,
        })

        return {
            assetId: result.id,
            s3Key,
            uploadToken,
            uploadStatus: 'preparing' as UploadStatus,
        }
    },

    complete: async (
        assetId: number,
        secret: string,
        data: {
            fileHash: string
            storageTiers: string
            gdriveFileId: string | null
            localPath: string | null
            thumbnailBase64: string | null
        },
    ) => {
        const asset = await deps.db.getById(assetId)
        if (!asset) throw createAppError('DRIVE_ASSET_NOT_FOUND')

        if (asset.uploadToken !== secret) {
            throw createAppError('UNAUTHORIZED')
        }

        if (asset.uploadStatus !== 'preparing' && asset.uploadStatus !== 'uploading') {
            throw createAppError('DRIVE_UPLOAD_EVENT_FAILED')
        }

        const existing = asset.fileHash ? null : await deps.db.getByUserAndHash(asset.userId, data.fileHash)
        if (existing && existing.id !== assetId) {
            await deps.db.remove(assetId)
            throw createAppError('DRIVE_DUPLICATE_FILE')
        }

        const thumbnailBlob = data.thumbnailBase64 ? Buffer.from(data.thumbnailBase64, 'base64') : null

        await deps.db.update(assetId, {
            uploadStatus: data.storageTiers ? 'ready' : 'failed',
            uploadToken: null,
            storageTiers: data.storageTiers || '',
            gdriveFileId: data.gdriveFileId,
            localPath: data.localPath,
            thumbnailBlob,
        })

        if (data.fileHash) {
            await deps.db.update(assetId, { storageTiers: data.storageTiers } as Record<string, unknown>)
        }

        return { id: assetId, uploadStatus: data.storageTiers ? 'ready' : 'failed' }
    },

    list: async (userId: string, query: { page: number; limit: number; mimeType?: string; folderId?: string; sort: string; order: string }) => {
        const offset = (query.page - 1) * query.limit
        const { data, total } = await deps.db.list({
            userId,
            limit: query.limit,
            offset,
            mimeType: query.mimeType,
            folderId: query.folderId,
            sort: query.sort,
            order: query.order,
        })

        const items = data.map((row) => ({
            id: row.id,
            originalName: row.originalName,
            mimeType: row.mimeType,
            sizeBytes: row.sizeBytes,
            folderId: row.folderId,
            isPublic: row.isPublic,
            storageTiers: row.storageTiers,
            uploadStatus: row.uploadStatus,
            thumbnail: row.thumbnailBlob ? `data:image/webp;base64,${row.thumbnailBlob.toString('base64')}` : null,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
        }))

        return { data: items, total, page: query.page, limit: query.limit }
    },

    getDetail: async (assetId: number, userId: string) => {
        const asset = await deps.db.getById(assetId)
        if (!asset) throw createAppError('DRIVE_ASSET_NOT_FOUND')
        if (asset.userId !== userId) throw createAppError('DRIVE_ASSET_NOT_FOUND')

        await deps.db.update(assetId, { lastViewedAt: new Date(), accessCount: asset.accessCount + 1 })

        const tiers = parseTiers(asset.storageTiers)
        let url: string

        if (tiers.has('L1')) {
            url = asset.isPublic ? deps.storage.getUrl(asset.s3Key) : await deps.storage.getPresignedUrl(asset.s3Key, 300)
        } else {
            url = `/api/drive/assets/${assetId}/download`
        }

        return {
            id: asset.id,
            originalName: asset.originalName,
            mimeType: asset.mimeType,
            sizeBytes: asset.sizeBytes,
            folderId: asset.folderId,
            isPublic: asset.isPublic,
            fileHash: asset.fileHash,
            storageTiers: asset.storageTiers,
            uploadStatus: asset.uploadStatus,
            url,
            thumbnail: asset.thumbnailBlob ? `data:image/webp;base64,${asset.thumbnailBlob.toString('base64')}` : null,
            lastViewedAt: asset.lastViewedAt?.toISOString() ?? null,
            createdAt: asset.createdAt.toISOString(),
            updatedAt: asset.updatedAt.toISOString(),
        }
    },

    download: async (assetId: number, userId: string): Promise<{ stream: ReadableStream; mimeType: string; originalName: string; sizeBytes: number }> => {
        const asset = await deps.db.getById(assetId)
        if (!asset) throw createAppError('DRIVE_ASSET_NOT_FOUND')
        if (asset.userId !== userId) throw createAppError('DRIVE_ASSET_NOT_FOUND')

        await deps.db.update(assetId, { lastViewedAt: new Date(), accessCount: asset.accessCount + 1 })

        const tiers = parseTiers(asset.storageTiers)

        if (tiers.has('L3') && asset.gdriveFileId && deps.gdriveStorage) {
            const stream = await deps.gdriveStorage.download(asset.gdriveFileId)
            return { stream, mimeType: asset.mimeType, originalName: asset.originalName, sizeBytes: asset.sizeBytes }
        }

        throw createAppError('DRIVE_ALL_TIERS_FAILED')
    },

    update: async (assetId: number, userId: string, data: { originalName?: string; isPublic?: boolean; folderId?: string | null }) => {
        const asset = await deps.db.getById(assetId)
        if (!asset) throw createAppError('DRIVE_ASSET_NOT_FOUND')
        if (asset.userId !== userId) throw createAppError('DRIVE_ASSET_NOT_FOUND')

        if (data.folderId !== undefined && data.folderId !== null) {
            const folder = await deps.folderDb.getById(data.folderId)
            if (!folder || folder.userId !== userId) throw createAppError('DRIVE_FOLDER_NOT_FOUND')
        }

        const updateData: Partial<{ originalName: string; isPublic: boolean; folderId: string | null }> = {}
        if (data.originalName !== undefined) updateData.originalName = sanitizeFilename(data.originalName)
        if (data.isPublic !== undefined) updateData.isPublic = data.isPublic
        if (data.folderId !== undefined) updateData.folderId = data.folderId

        if (Object.keys(updateData).length > 0) {
            await deps.db.update(assetId, updateData)
        }

        return { id: assetId, ...updateData }
    },

    remove: async (assetId: number, userId: string) => {
        const asset = await deps.db.getById(assetId)
        if (!asset) throw createAppError('DRIVE_ASSET_NOT_FOUND')
        if (asset.userId !== userId) throw createAppError('DRIVE_ASSET_NOT_FOUND')

        await deps.db.remove(assetId)

        const tiers = parseTiers(asset.storageTiers)

        if (tiers.has('L1')) {
            try {
                await deps.storage.del(asset.s3Key)
            } catch {}
        }

        if (tiers.has('L3') && asset.gdriveFileId && deps.gdriveStorage) {
            try {
                await deps.gdriveStorage.del(asset.gdriveFileId)
            } catch {}
        }

        return { id: assetId }
    },

    getQuota: async (userId: string) => {
        const quotaBytes = await deps.getUserQuotaBytes(userId)
        const used = await deps.db.getTotalSizeByUser(userId)
        return {
            used,
            total: quotaBytes,
            remaining: quotaBytes - used,
        }
    },
})

export type DriveAssetService = ReturnType<typeof createDriveAssetService>
