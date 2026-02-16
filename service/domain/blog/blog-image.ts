type ImageAsset = {
    id: string
    url: string
    mimeType: string
    sizeBytes: number
    width: number | null
    height: number | null
}

type LegacyImage = {
    imageId: number
    fileName: string
    originalName: string
    url: string
    mimeType: string
    fileSize: number
    width: number
    height: number
    createdAt: Date
}

type StorageService = {
    upload: (key: string, body: Buffer, contentType: string) => Promise<void>
    delete: (key: string) => Promise<void>
    getUrl: (key: string) => string
}

type ImageProcessorService = {
    toWebp: (buffer: Buffer) => Promise<Buffer>
    getMetadata: (buffer: Buffer) => Promise<{ width: number; height: number }>
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
    getImageList: () => Promise<LegacyImage[]>
    insertLegacyImage: (data: {
        userId: string
        fileName: string
        originalName: string
        url: string
        mimeType: string
        fileSize: number
        width: number
        height: number
    }) => Promise<{ imageId: number }>
}

type BlogImageDeps = {
    storage: StorageService
    imageProcessor: ImageProcessorService
    db: BlogImageDb
    bucket: string
    generateId: () => string
}

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']

export const createBlogImageService = (deps: BlogImageDeps) => ({
    upload: async (file: File, userId: string): Promise<ImageAsset> => {
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            throw new Error('BLOG_IMAGE_INVALID_TYPE')
        }

        if (file.size > MAX_FILE_SIZE) {
            throw new Error('BLOG_IMAGE_TOO_LARGE')
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        const webpBuffer = await deps.imageProcessor.toWebp(buffer)
        const metadata = await deps.imageProcessor.getMetadata(webpBuffer)

        const id = deps.generateId()
        const key = `blog/${id}.webp`

        await deps.storage.upload(key, webpBuffer, 'image/webp')

        await deps.db.insertImageAsset({
            id,
            r2Key: key,
            bucket: deps.bucket,
            mimeType: 'image/webp',
            sizeBytes: webpBuffer.length,
            width: metadata.width,
            height: metadata.height,
            checksum: null,
            uploadedBy: userId,
        })

        const url = deps.storage.getUrl(key)

        await deps.db.insertLegacyImage({
            userId,
            fileName: `${id}.webp`,
            originalName: file.name,
            url,
            mimeType: 'image/webp',
            fileSize: webpBuffer.length,
            width: metadata.width,
            height: metadata.height,
        })

        return {
            id,
            url,
            mimeType: 'image/webp',
            sizeBytes: webpBuffer.length,
            width: metadata.width,
            height: metadata.height,
        }
    },

    getList: async () => {
        return deps.db.getImageList()
    },
})

export type BlogImageService = ReturnType<typeof createBlogImageService>
