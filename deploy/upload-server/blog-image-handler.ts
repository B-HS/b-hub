import { createWriteStream, mkdirSync, readFileSync, unlinkSync } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { join } from 'path'
import type { R2Client } from './r2-client'
import { isValidAssetId } from './upload-handler'

type BlogImageHandlerDeps = {
    r2: R2Client
    hubBaseUrl: string
    tmpDir: string
    generateId: () => string
    imageProcessor: {
        toWebp: (buffer: Buffer, quality?: number) => Promise<Buffer>
        getMetadata: (buffer: Buffer) => Promise<{ width: number; height: number }>
    }
    maxFileSize: number
    allowedMimeTypes: string[]
}

const saveFileToDisk = async (file: File, destPath: string): Promise<void> => {
    const writer = createWriteStream(destPath)
    const reader = file.stream()
    const nodeReadable = Readable.fromWeb(reader as unknown as import('stream/web').ReadableStream)
    await pipeline(nodeReadable, writer)
}

export const createBlogImageHandler = (deps: BlogImageHandlerDeps) => {
    mkdirSync(deps.tmpDir, { recursive: true })

    return {
        handle: async (
            file: File,
            assetId: string,
            s3Key: string,
            uploadToken: string,
        ): Promise<{ success: boolean; message: string; url?: string }> => {
            const startTime = Date.now()
            console.log(`[blog-image] start assetId=${assetId} file=${file.name} size=${file.size} type=${file.type}`)

            if (!isValidAssetId(assetId)) {
                return { success: false, message: 'Invalid assetId' }
            }
            if (!deps.allowedMimeTypes.includes(file.type)) {
                return { success: false, message: `Invalid mime type: ${file.type}` }
            }
            if (file.size > deps.maxFileSize) {
                return { success: false, message: `File too large: ${file.size}` }
            }
            if (s3Key !== `${assetId}.webp`) {
                return { success: false, message: 'Invalid s3Key' }
            }

            const tmpPath = join(deps.tmpDir, `${assetId}_${deps.generateId()}`)

            try {
                await saveFileToDisk(file, tmpPath)

                const originalBuffer = Buffer.from(readFileSync(tmpPath))
                const webpBuffer = await deps.imageProcessor.toWebp(originalBuffer)
                const metadata = await deps.imageProcessor.getMetadata(webpBuffer)

                const r2Result = await deps.r2.uploadBuffer(s3Key, webpBuffer, 'image/webp')
                if (!r2Result.success) {
                    return { success: false, message: `R2 upload failed: ${r2Result.error}` }
                }

                const completeRes = await fetch(`${deps.hubBaseUrl}/api/blog/images/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        assetId,
                        s3Key,
                        uploadToken,
                        sizeBytes: webpBuffer.length,
                        width: metadata.width,
                        height: metadata.height,
                    }),
                })

                if (!completeRes.ok) {
                    const text = await completeRes.text()
                    console.error(`[blog-image] complete callback failed: ${completeRes.status} ${text}`)
                    return { success: false, message: `Complete callback failed: ${completeRes.status}` }
                }

                const completeData = (await completeRes.json()) as { success: boolean; data?: { url: string } }
                const url = completeData.data?.url

                const elapsed = Date.now() - startTime
                console.log(`[blog-image] done assetId=${assetId} url=${url} elapsed=${elapsed}ms`)

                return { success: true, message: 'ok', url }
            } finally {
                try {
                    unlinkSync(tmpPath)
                } catch {}
            }
        },
    }
}

export type BlogImageHandler = ReturnType<typeof createBlogImageHandler>
