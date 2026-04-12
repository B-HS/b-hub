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
        }
    }
    throw lastError
}

export const createUploadHandler = (deps: UploadHandlerDeps) => ({
    handle: async (file: File, assetId: number, s3Key: string, uploadToken: string): Promise<{ success: boolean; message: string }> => {
        const buffer = Buffer.from(await file.arrayBuffer())
        const fileHash = await computeHash(buffer)

        let thumbnailBase64: string | null = null
        if (file.type.startsWith(IMAGE_MIME_PREFIX) && deps.imageProcessor) {
            try {
                const resized = await deps.imageProcessor.resize(buffer, 100, 100)
                const webp = await deps.imageProcessor.toWebp(resized, 60)
                thumbnailBase64 = webp.toString('base64')
            } catch {
                thumbnailBase64 = null
            }
        }

        const tiers: string[] = []
        let gdriveFileId: string | null = null
        let localPath: string | null = null

        const gdriveResult = await withRetry(async () => {
            const result = await deps.gdrive.upload(s3Key.split('/')[1] ?? 'unknown', file.name, buffer, file.type)
            if (!result.success) throw new Error(result.error)
            return result
        }, 2).catch((error) => ({ success: false as const, error: error instanceof Error ? error.message : 'Google Drive upload failed' }))

        if (gdriveResult.success) {
            tiers.push('L3')
            gdriveFileId = gdriveResult.gdriveFileId
        }

        if (file.size <= deps.l1MaxFileSize) {
            const r2Result = await withRetry(async () => {
                const result = await deps.r2.upload(s3Key, buffer, file.type)
                if (!result.success) throw new Error(result.error)
                return result
            }, 2).catch((error) => ({ success: false as const, error: error instanceof Error ? error.message : 'R2 upload failed' }))

            if (r2Result.success) {
                tiers.push('L1')
            }
        }

        const localResult = await deps.local.upload(s3Key, buffer, file.type)
        if (localResult.success) {
            tiers.push('L2')
            localPath = s3Key
        }

        const storageTiers = tiers.sort().join(',')

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
            return { success: false, message: `Complete callback failed: ${completeRes.status} ${text}` }
        }

        if (tiers.length === 0) {
            return { success: false, message: 'All storage tiers failed' }
        }

        return { success: true, message: `Uploaded to ${storageTiers}` }
    },
})

export type UploadHandler = ReturnType<typeof createUploadHandler>
