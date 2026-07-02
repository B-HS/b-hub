import type { AiAttachment } from '../../../db/schema'
import type { AiImagePart } from './ai-provider'
import { createAppError } from '../../../lib/error'
import { sanitizeFilename } from '../../../lib/mail-utils'

type StorageService = {
    upload: (key: string, body: Buffer, contentType: string) => Promise<void>
    delete: (key: string) => Promise<void>
    getUrl: (key: string) => string
    download: (key: string) => Promise<Buffer | null>
}

export type AiAttachmentInsert = {
    userId: string
    filename: string
    mimeType: string
    sizeBytes: number
    r2Key: string
}

export type AiAttachmentServiceDb = {
    insert: (data: AiAttachmentInsert) => Promise<{ id: number }>
    getById: (id: number) => Promise<AiAttachment | null>
    getByIds: (ids: number[]) => Promise<AiAttachment[]>
    attachToMessage: (ids: number[], messageId: number) => Promise<void>
    deleteById: (id: number) => Promise<void>
}

type AiAttachmentDeps = {
    storage: StorageService
    db: AiAttachmentServiceDb
    generateId: () => string
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_SIZE = 20 * 1024 * 1024
const MAGIC_BYTES: Record<string, number[][]> = {
    'image/jpeg': [[0xff, 0xd8, 0xff]],
    'image/png': [[0x89, 0x50, 0x4e, 0x47]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]],
}

export const createAiAttachmentService = ({ storage, db, generateId }: AiAttachmentDeps) => {
    const upload = async (file: File, userId: string) => {
        if (!ALLOWED_MIME_TYPES.includes(file.type)) throw createAppError('AI_ATTACHMENT_INVALID_TYPE')
        if (file.size > MAX_SIZE) throw createAppError('AI_ATTACHMENT_TOO_LARGE')

        const buffer = Buffer.from(await file.arrayBuffer())
        if (buffer.length > MAX_SIZE) throw createAppError('AI_ATTACHMENT_TOO_LARGE')

        const signatures = MAGIC_BYTES[file.type]
        if (signatures && !signatures.some((sig) => sig.every((byte, i) => buffer[i] === byte))) {
            throw createAppError('AI_ATTACHMENT_INVALID_TYPE')
        }

        const safeName = sanitizeFilename(file.name)
        const r2Key = `ai/attachments/${userId}/${generateId()}/${safeName}`
        await storage.upload(r2Key, buffer, file.type)

        const { id } = await db.insert({ userId, filename: safeName, mimeType: file.type, sizeBytes: buffer.length, r2Key })
        return { id, url: storage.getUrl(r2Key), filename: safeName, mimeType: file.type, sizeBytes: buffer.length }
    }

    const getOwnedRecords = async (userId: string, ids: number[]) => {
        const uniqueIds = [...new Set(ids)]
        const records = await db.getByIds(uniqueIds)
        if (records.length !== uniqueIds.length || records.some((r) => r.userId !== userId)) {
            throw createAppError('AI_ATTACHMENT_NOT_FOUND')
        }
        return records
    }

    const resolveImages = async (userId: string, ids: number[]): Promise<AiImagePart[]> => {
        if (ids.length === 0) return []
        const records = await getOwnedRecords(userId, ids)
        const parts: AiImagePart[] = []
        for (const record of records) {
            const content = await storage.download(record.r2Key)
            if (!content) throw createAppError('AI_ATTACHMENT_NOT_FOUND')
            parts.push({ mimeType: record.mimeType, dataBase64: content.toString('base64') })
        }
        return parts
    }

    const attachToMessage = async (userId: string, ids: number[], messageId: number) => {
        if (ids.length === 0) return
        await getOwnedRecords(userId, ids)
        await db.attachToMessage([...new Set(ids)], messageId)
    }

    const remove = async (userId: string, id: number) => {
        const record = await db.getById(id)
        if (!record || record.userId !== userId) throw createAppError('AI_ATTACHMENT_NOT_FOUND')
        await storage.delete(record.r2Key)
        await db.deleteById(id)
    }

    return { upload, resolveImages, attachToMessage, remove }
}

export type AiAttachmentService = ReturnType<typeof createAiAttachmentService>
