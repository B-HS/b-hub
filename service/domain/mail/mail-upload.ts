import type { MailUpload } from '../../../db/schema'
import type { ComposeAttachment } from './mail-provider'
import { createAppError } from '../../../lib/error'
import { sanitizeFilename } from '../../../lib/mail-utils'

type StorageService = {
    upload: (key: string, body: Buffer, contentType: string) => Promise<void>
    delete: (key: string) => Promise<void>
    getUrl: (key: string) => string
    download: (key: string) => Promise<Buffer | null>
}

type MailUploadDb = {
    insert: (data: {
        userId: string
        filename: string
        mimeType: string
        sizeBytes: number
        r2Key: string
        isInline: boolean
    }) => Promise<{ id: number }>
    getById: (id: number) => Promise<MailUpload | null>
    getByIds: (ids: number[]) => Promise<MailUpload[]>
    deleteById: (id: number) => Promise<void>
}

type MailUploadDeps = {
    storage: StorageService
    db: MailUploadDb
    generateId: () => string
}

const MIME_TYPE_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/

const INLINE_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const INLINE_MAX_SIZE = 10 * 1024 * 1024

const MAGIC_BYTES: Record<string, number[][]> = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]],
}

const ATTACHMENT_BLOCKED_MIME_TYPES = [
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
]
const ATTACHMENT_BLOCKED_EXTENSIONS = new Set([
    '.exe', '.bat', '.cmd', '.scr', '.msi', '.pif', '.vbs', '.js', '.ps1', '.sh', '.com',
])

const ATTACHMENT_MAX_SIZE = 25 * 1024 * 1024

export const createMailUploadService = (deps: MailUploadDeps) => {
    const upload = async (file: File, userId: string, inline: boolean) => {
        if (!MIME_TYPE_REGEX.test(file.type)) {
            throw createAppError('MAIL_UPLOAD_INVALID_TYPE')
        }

        if (inline) {
            if (!INLINE_ALLOWED_MIME_TYPES.includes(file.type)) {
                throw createAppError('MAIL_UPLOAD_INVALID_TYPE')
            }
            if (file.size > INLINE_MAX_SIZE) {
                throw createAppError('MAIL_UPLOAD_TOO_LARGE')
            }
        } else {
            if (ATTACHMENT_BLOCKED_MIME_TYPES.includes(file.type)) {
                throw createAppError('MAIL_UPLOAD_INVALID_TYPE')
            }
            const safeName = sanitizeFilename(file.name)
            const extMatch = safeName.match(/(\.[^.]+)$/)
            if (extMatch && ATTACHMENT_BLOCKED_EXTENSIONS.has(extMatch[1].toLowerCase())) {
                throw createAppError('MAIL_UPLOAD_BLOCKED_EXTENSION')
            }
            if (file.size > ATTACHMENT_MAX_SIZE) {
                throw createAppError('MAIL_UPLOAD_TOO_LARGE')
            }
        }

        const buffer = Buffer.from(await file.arrayBuffer())

        const maxSize = inline ? INLINE_MAX_SIZE : ATTACHMENT_MAX_SIZE
        if (buffer.length > maxSize) {
            throw createAppError('MAIL_UPLOAD_TOO_LARGE')
        }

        if (inline) {
            const signatures = MAGIC_BYTES[file.type]
            if (signatures) {
                const matches = signatures.some((sig) =>
                    sig.every((byte, i) => buffer[i] === byte),
                )
                if (!matches) {
                    throw createAppError('MAIL_UPLOAD_INVALID_TYPE')
                }
            }
        }

        const uuid = deps.generateId()
        const safeName = sanitizeFilename(file.name)
        const r2Key = `mail/uploads/${userId}/${uuid}/${safeName}`

        await deps.storage.upload(r2Key, buffer, file.type)

        const { id } = await deps.db.insert({
            userId,
            filename: safeName,
            mimeType: file.type,
            sizeBytes: buffer.length,
            r2Key,
            isInline: inline,
        })

        return {
            id,
            url: deps.storage.getUrl(r2Key),
            filename: safeName,
            mimeType: file.type,
            sizeBytes: buffer.length,
            isInline: inline,
        }
    }

    const deleteUpload = async (id: number, userId: string) => {
        const record = await deps.db.getById(id)
        if (!record || record.userId !== userId) {
            throw createAppError('MAIL_UPLOAD_NOT_FOUND')
        }

        await deps.storage.delete(record.r2Key)
        await deps.db.deleteById(id)
    }

    const resolveForSend = async (ids: number[], userId: string): Promise<ComposeAttachment[]> => {
        const uniqueIds = [...new Set(ids)]
        const records = await deps.db.getByIds(uniqueIds)
        if (records.length !== uniqueIds.length) {
            throw createAppError('MAIL_UPLOAD_NOT_FOUND')
        }
        if (records.some((r) => r.userId !== userId)) {
            throw createAppError('MAIL_UPLOAD_NOT_FOUND')
        }

        const attachments: ComposeAttachment[] = []
        for (const record of records) {
            const content = await deps.storage.download(record.r2Key)
            if (!content) throw createAppError('MAIL_UPLOAD_NOT_FOUND')
            attachments.push({
                content,
                filename: record.filename,
                mimeType: record.mimeType,
            })
        }

        return attachments
    }

    return { upload, deleteUpload, resolveForSend }
}

export type MailUploadService = ReturnType<typeof createMailUploadService>
