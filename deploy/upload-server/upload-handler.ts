import type { R2Client } from './r2-client'
import type { GdriveClient } from './gdrive-client'
import type { LocalClient } from './local-client'

type UploadHandlerDeps = {
    r2: R2Client
    gdrive: GdriveClient
    local: LocalClient
    hubBaseUrl: string
    generateId: () => string
    l1MaxFileSize: number
    imageProcessor: {
        resize: (buffer: Buffer, width: number, height?: number) => Promise<Buffer>
        toWebp: (buffer: Buffer, quality?: number) => Promise<Buffer>
    } | null
}

const IMAGE_MIME_PREFIX = 'image/'

const computeHash = async (buffer: Buffer): Promise<string> => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', new Uint8Array(buffer))
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

const withRetry = async <T>(fn: () => Promise<T>, maxRetries: number): Promise<T> => {
    let lastError: unknown
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error
            console.warn(`[retry] attempt ${i + 1}/${maxRetries} failed:`, error instanceof Error ? error.message : error)
        }
    }
    throw lastError
}

export const createUploadHandler = (deps: UploadHandlerDeps) => ({
    handle: async (file: File, assetId: number, s3Key: string, uploadToken: string, gdriveAccessToken: string | null, gdriveRootFolderId: string | null): Promise<{ success: boolean; message: string }> => {
        const startTime = Date.now()
        console.log(`[upload] start assetId=${assetId} file=${file.name} size=${file.size} type=${file.type}`)

        const buffer = Buffer.from(await file.arrayBuffer())
        const fileHash = await computeHash(buffer)
        console.log(`[upload] hash=${fileHash.slice(0, 12)}...`)

        let thumbnailBase64: string | null = null
        if (file.type.startsWith(IMAGE_MIME_PREFIX) && deps.imageProcessor) {
            try {
                const resized = await deps.imageProcessor.resize(buffer, 100, 100)
                const webp = await deps.imageProcessor.toWebp(resized, 60)
                thumbnailBase64 = webp.toString('base64')
                console.log(`[upload] thumbnail generated`)
            } catch (error) {
                console.warn(`[upload] thumbnail failed:`, error instanceof Error ? error.message : error)
                thumbnailBase64 = null
            }
        }

        const tiers: string[] = []
        let gdriveFileId: string | null = null
        let localPath: string | null = null

        if (gdriveAccessToken && gdriveRootFolderId) {
            const gdriveResult = await withRetry(async () => {
                const result = await deps.gdrive.upload(gdriveAccessToken, gdriveRootFolderId, s3Key, buffer, file.type)
                if (!result.success) throw new Error(result.error)
                return result
            }, 2).catch((error) => ({ success: false as const, error: error instanceof Error ? error.message : 'Google Drive upload failed' }))

            if (gdriveResult.success) {
                tiers.push('L3')
                gdriveFileId = gdriveResult.gdriveFileId
                console.log(`[upload] gdrive ok fileId=${gdriveFileId}`)
            } else {
                console.error(`[upload] gdrive failed: ${gdriveResult.error}`)
            }
        } else {
            console.log(`[upload] gdrive skipped (no access token)`)
        }

        if (file.size <= deps.l1MaxFileSize) {
            const r2Result = await withRetry(async () => {
                const result = await deps.r2.upload(s3Key, buffer, file.type)
                if (!result.success) throw new Error(result.error)
                return result
            }, 2).catch((error) => ({ success: false as const, error: error instanceof Error ? error.message : 'R2 upload failed' }))

            if (r2Result.success) {
                tiers.push('L1')
                console.log(`[upload] r2 ok key=${s3Key}`)
            } else {
                console.error(`[upload] r2 failed: ${r2Result.error}`)
            }
        } else {
            console.log(`[upload] r2 skipped (size ${file.size} > ${deps.l1MaxFileSize})`)
        }

        const localResult = await deps.local.upload(s3Key, buffer, file.type)
        if (localResult.success) {
            tiers.push('L2')
            localPath = s3Key
            console.log(`[upload] local ok`)
        }

        const storageTiers = tiers.sort().join(',')
        console.log(`[upload] tiers=${storageTiers || 'NONE'}`)

        const completeRes = await fetch(`${deps.hubBaseUrl}/api/drive/assets/${assetId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uploadToken,
                fileHash,
                storageTiers,
                gdriveFileId,
                localPath,
                thumbnailBase64,
            }),
        })

        if (!completeRes.ok) {
            const text = await completeRes.text()
            console.error(`[upload] complete callback failed: ${completeRes.status} ${text}`)
            return { success: false, message: `Complete callback failed: ${completeRes.status} ${text}` }
        }

        console.log(`[upload] complete callback ok`)

        if (tiers.length === 0) {
            console.error(`[upload] all tiers failed for assetId=${assetId}`)
            return { success: false, message: 'All storage tiers failed' }
        }

        const elapsed = Date.now() - startTime
        console.log(`[upload] done assetId=${assetId} tiers=${storageTiers} elapsed=${elapsed}ms`)

        return { success: true, message: `Uploaded to ${storageTiers}` }
    },
})

export type UploadHandler = ReturnType<typeof createUploadHandler>
