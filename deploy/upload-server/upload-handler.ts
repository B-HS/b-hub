import { createHash } from 'crypto'
import { createReadStream, createWriteStream, statSync, unlinkSync, mkdirSync } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { join } from 'path'
import type { R2Client } from './r2-client'
import type { GdriveClient } from './gdrive-client'
import type { LocalClient } from './local-client'

type UploadHandlerDeps = {
    r2: R2Client
    gdrive: GdriveClient
    local: LocalClient
    hubBaseUrl: string
    uploadServerSecret: string
    generateId: () => string
    l1MaxFileSize: number
    tmpDir: string
    imageProcessor: {
        resize: (buffer: Buffer, width: number, height?: number) => Promise<Buffer>
        toWebp: (buffer: Buffer, quality?: number) => Promise<Buffer>
    } | null
}

const IMAGE_MIME_PREFIX = 'image/'
const THUMBNAIL_MAX_SIZE = 20 * 1024 * 1024
const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const UPLOAD_KEY_PREFIX = 'users/'
const UPLOAD_KEY_SEGMENT_COUNT = 4
const TRAVERSAL_SEGMENTS = ['', '.', '..']

export const isValidAssetId = (value: string) => ASSET_ID_PATTERN.test(value)

export const isValidUploadKey = (value: string) => {
    if (!value.startsWith(UPLOAD_KEY_PREFIX) || value.includes('\\')) return false
    const segments = value.split('/')
    if (segments.length !== UPLOAD_KEY_SEGMENT_COUNT) return false
    return segments.every((segment) => !TRAVERSAL_SEGMENTS.includes(segment))
}

const computeHashFromFile = (filePath: string): Promise<string> =>
    new Promise((resolve, reject) => {
        const hash = createHash('sha256')
        const stream = createReadStream(filePath)
        stream.on('data', (chunk) => hash.update(chunk))
        stream.on('end', () => resolve(hash.digest('hex')))
        stream.on('error', reject)
    })

const saveFileToDisk = async (file: File, destPath: string): Promise<void> => {
    const writer = createWriteStream(destPath)
    const reader = file.stream()
    const nodeReadable = Readable.fromWeb(reader as unknown as import('stream/web').ReadableStream)
    await pipeline(nodeReadable, writer)
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

export const createUploadHandler = (deps: UploadHandlerDeps) => {
    mkdirSync(deps.tmpDir, { recursive: true })

    const hubHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deps.uploadServerSecret}` }

    return {
        handle: async (
            file: File,
            assetId: number,
            s3Key: string,
            uploadToken: string,
        ): Promise<{ success: boolean; message: string; unauthorized?: boolean }> => {
            const startTime = Date.now()
            console.log(`[upload] start assetId=${assetId} file=${file.name} size=${file.size} type=${file.type}`)

            if (!isValidUploadKey(s3Key)) {
                console.warn(`[upload] rejected: invalid s3Key assetId=${assetId}`)
                return { success: false, message: 'Invalid s3Key' }
            }

            const tmpPath = join(deps.tmpDir, `${assetId}_${deps.generateId()}`)

            try {
                const statusRes = await fetch(`${deps.hubBaseUrl}/api/drive/assets/${assetId}/status`, {
                    method: 'POST',
                    headers: hubHeaders,
                    body: JSON.stringify({ uploadToken, status: 'uploading' }),
                }).catch(() => null)

                if (!statusRes || !statusRes.ok) {
                    console.error(`[upload] status callback rejected assetId=${assetId} status=${statusRes ? statusRes.status : 'network-error'}`)
                    return { success: false, message: 'Upload not authorized', unauthorized: true }
                }

                const statusData = (await statusRes.json().catch(() => null)) as { success?: boolean; data?: { s3Key?: string } } | null
                if (!statusData || !statusData.success) {
                    console.error(`[upload] status callback not successful assetId=${assetId}`)
                    return { success: false, message: 'Upload not authorized', unauthorized: true }
                }

                const hubS3Key = statusData.data?.s3Key
                if (hubS3Key && hubS3Key !== s3Key) {
                    console.error(`[upload] s3Key mismatch assetId=${assetId}`)
                    return { success: false, message: 'Upload not authorized', unauthorized: true }
                }

                const storageKey = hubS3Key ?? s3Key

                await saveFileToDisk(file, tmpPath)
                const sizeBytes = statSync(tmpPath).size
                console.log(`[upload] saved to disk: ${tmpPath} size=${sizeBytes}`)

                const fileHash = await computeHashFromFile(tmpPath)
                console.log(`[upload] hash=${fileHash.slice(0, 12)}...`)

                let thumbnailBase64: string | null = null
                if (file.type.startsWith(IMAGE_MIME_PREFIX) && deps.imageProcessor && file.size <= THUMBNAIL_MAX_SIZE) {
                    try {
                        const imgBuffer = await Bun.file(tmpPath).arrayBuffer()
                        const resized = await deps.imageProcessor.resize(Buffer.from(imgBuffer), 100, 100)
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

                const tokenRes = await fetch(`${deps.hubBaseUrl}/api/drive/assets/${assetId}/gdrive-token`, {
                    method: 'POST',
                    headers: hubHeaders,
                    body: JSON.stringify({ uploadToken }),
                })

                if (tokenRes.ok) {
                    const tokenData = (await tokenRes.json()) as { success: boolean; data: { accessToken: string; rootFolderId: string } }
                    if (tokenData.success) {
                        const { accessToken, rootFolderId } = tokenData.data
                        const gdriveResult = await withRetry(async () => {
                            const result = await deps.gdrive.upload(accessToken, rootFolderId, storageKey, tmpPath, file.type)
                            if (!result.success) throw new Error(result.error)
                            return result
                        }, 2).catch((error) => ({
                            success: false as const,
                            error: error instanceof Error ? error.message : 'Google Drive upload failed',
                        }))

                        if (gdriveResult.success) {
                            tiers.push('L3')
                            gdriveFileId = gdriveResult.gdriveFileId
                            console.log(`[upload] gdrive ok fileId=${gdriveFileId}`)
                        } else {
                            console.error(`[upload] gdrive failed: ${gdriveResult.error}`)
                        }
                    } else {
                        console.log(`[upload] gdrive skipped (token exchange failed)`)
                    }
                } else {
                    console.log(`[upload] gdrive skipped (token endpoint ${tokenRes.status})`)
                }

                if (sizeBytes <= deps.l1MaxFileSize) {
                    const r2Result = await withRetry(async () => {
                        const result = await deps.r2.upload(storageKey, tmpPath, file.type)
                        if (!result.success) throw new Error(result.error)
                        return result
                    }, 2).catch((error) => ({ success: false as const, error: error instanceof Error ? error.message : 'R2 upload failed' }))

                    if (r2Result.success) {
                        tiers.push('L1')
                        console.log(`[upload] r2 ok key=${storageKey}`)
                    } else {
                        console.error(`[upload] r2 failed: ${r2Result.error}`)
                    }
                } else {
                    console.log(`[upload] r2 skipped (size ${sizeBytes} > ${deps.l1MaxFileSize})`)
                }

                // TODO: 10GB 초과 파일은 Mac Studio로 스트리밍-스트리밍 전송
                // createReadStream(tmpPath)을 body로 Mac Studio HTTP API에 전달
                const localResult = await deps.local.upload(storageKey, tmpPath, file.type)
                if (localResult.success) {
                    tiers.push('L2')
                    localPath = storageKey
                    console.log(`[upload] local ok`)
                }

                const storageTiers = tiers.sort().join(',')
                console.log(`[upload] tiers=${storageTiers || 'NONE'}`)

                const completeRes = await fetch(`${deps.hubBaseUrl}/api/drive/assets/${assetId}/complete`, {
                    method: 'POST',
                    headers: hubHeaders,
                    body: JSON.stringify({
                        uploadToken,
                        fileHash,
                        storageTiers,
                        gdriveFileId,
                        localPath,
                        thumbnailBase64,
                        sizeBytes,
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
            } finally {
                try {
                    unlinkSync(tmpPath)
                } catch {}
            }
        },
    }
}

export type UploadHandler = ReturnType<typeof createUploadHandler>
