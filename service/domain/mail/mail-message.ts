import type { MailMessage, MailAttachment } from '../../../db/schema'
import type { MailAccountService } from './mail-account'
import type { AttachmentData, ComposeEmailData, EmailAddress } from './mail-provider'
import type { MailUploadService } from './mail-upload'
import { createAppError, isAppError } from '../../../lib/error'
import { escapeHtml, sanitizeFilename, sanitizeHeaderValue, maskProviderError } from '../../../lib/mail-utils'

type MailMessageSummary = Omit<MailMessage, 'bodyHtml' | 'bodyText'>

type MailMessageDb = {
    list: (params: {
        accountId?: number
        folderId?: number
        isRead?: boolean
        isStarred?: boolean
        userId: string
        page: number
        limit: number
    }) => Promise<{ data: MailMessageSummary[]; total: number }>
    getById: (id: number) => Promise<(MailMessage & { attachments: MailAttachment[] }) | null>
    getThread: (accountId: number, threadId: string) => Promise<MailMessageSummary[]>
    search: (params: {
        q: string
        accountId?: number
        userId: string
        page: number
        limit: number
    }) => Promise<{ data: MailMessageSummary[]; total: number }>
    updateFlags: (messageIds: number[], flags: Partial<Pick<MailMessage, 'isRead' | 'isStarred'>>) => Promise<void>
    moveToFolder: (messageIds: number[], targetFolderId: number) => Promise<void>
    deleteMessages: (messageIds: number[]) => Promise<void>
    getByIds: (ids: number[]) => Promise<MailMessage[]>
    getAttachment: (attachmentId: number) => Promise<MailAttachment | null>
    updateAttachmentR2Key: (attachmentId: number, r2Key: string) => Promise<void>
    getAccountIdsByMessageIds: (
        messageIds: number[],
        userId: string,
    ) => Promise<{ messageId: number; accountId: number; remoteMessageId: string; folderId: number }[]>
    getUnreadMessages: (params: {
        userId: string
        accountId?: number
        folderId?: number
    }) => Promise<{ id: number; remoteMessageId: string; folderId: number }[]>
    getSenderList: (params: { userId: string; accountId?: number; limit: number }) => Promise<{ address: string; name: string }[]>
    countMessagesByFolder: (folderId: number) => Promise<number>
    countUnreadByFolder: (folderId: number) => Promise<number>
    updateFolderCounts: (folderId: number, messageCount: number, unreadCount: number) => Promise<void>
    getFolderById: (id: number) => Promise<{ id: number; accountId: number; remoteFolderId: string } | null>
}

type StorageService = {
    upload: (key: string, body: Buffer, contentType: string) => Promise<void>
    getUrl: (key: string) => string
    download: (key: string) => Promise<Buffer | null>
}

type MailMessageServiceDeps = {
    db: MailMessageDb
    accountService: MailAccountService
    storageService?: StorageService
    uploadService?: MailUploadService
}

export const createMailMessageService = (deps: MailMessageServiceDeps) => {
    const list = async (
        userId: string,
        query: {
            accountId?: number
            folderId?: number
            isRead?: boolean
            isStarred?: boolean
            page?: number
            limit?: number
        },
    ) => {
        return deps.db.list({
            userId,
            accountId: query.accountId,
            folderId: query.folderId,
            isRead: query.isRead,
            isStarred: query.isStarred,
            page: query.page ?? 1,
            limit: query.limit ?? 20,
        })
    }

    const getById = async (userId: string, messageId: number) => {
        const msg = await deps.db.getById(messageId)
        if (!msg) throw createAppError('MAIL_MESSAGE_NOT_FOUND')

        const accounts = await deps.accountService.list(userId)
        if (!accounts.some((a) => a.id === msg.accountId)) throw createAppError('MAIL_MESSAGE_NOT_FOUND')

        if (!msg.isRead) {
            applyFlagAction(userId, [messageId], 'markRead').catch(() => {})
        }

        return msg
    }

    const getThread = async (userId: string, accountId: number, threadId: string) => {
        await deps.accountService.getById(accountId, userId)
        return deps.db.getThread(accountId, threadId)
    }

    const applyFlagAction = async (userId: string, messageIds: number[], action: 'markRead' | 'markUnread' | 'markStarred' | 'unmarkStarred') => {
        const msgInfos = await deps.db.getAccountIdsByMessageIds(messageIds, userId)
        if (msgInfos.length !== messageIds.length) throw createAppError('MAIL_MESSAGE_NOT_FOUND')

        const flagUpdate: Partial<Pick<MailMessage, 'isRead' | 'isStarred'>> =
            action === 'markRead'
                ? { isRead: true }
                : action === 'markUnread'
                  ? { isRead: false }
                  : action === 'markStarred'
                    ? { isStarred: true }
                    : { isStarred: false }

        const grouped = new Map<string, { accountId: number; folderId: number; remoteIds: string[] }>()
        for (const info of msgInfos) {
            const key = `${info.accountId}:${info.folderId}`
            const group = grouped.get(key) ?? { accountId: info.accountId, folderId: info.folderId, remoteIds: [] }
            group.remoteIds.push(info.remoteMessageId)
            grouped.set(key, group)
        }

        for (const { accountId, folderId, remoteIds } of grouped.values()) {
            try {
                const { provider } = await deps.accountService.getProvider(accountId, userId)
                const folder = await deps.db.getFolderById(folderId)
                await provider.connect()
                await provider[action](remoteIds, folder?.remoteFolderId)
                await provider.disconnect()
            } catch {}
        }

        await deps.db.updateFlags(messageIds, flagUpdate)

        if (action === 'markRead' || action === 'markUnread') {
            const affectedFolderIds = [...new Set(msgInfos.map((m) => m.folderId))]
            await Promise.all(
                affectedFolderIds.map(async (fid) => {
                    const [msgCount, unreadCount] = await Promise.all([deps.db.countMessagesByFolder(fid), deps.db.countUnreadByFolder(fid)])
                    await deps.db.updateFolderCounts(fid, msgCount, unreadCount)
                }),
            )
        }
    }

    const markRead = (userId: string, messageIds: number[]) => applyFlagAction(userId, messageIds, 'markRead')
    const markUnread = (userId: string, messageIds: number[]) => applyFlagAction(userId, messageIds, 'markUnread')

    // 메일함(folderId) 또는 계정(accountId) 단위로 안읽은 메일 전체를 읽음 처리한다.
    const markAllRead = async (userId: string, params: { accountId?: number; folderId?: number }) => {
        let accountId: number
        if (params.folderId) {
            const folder = await deps.db.getFolderById(params.folderId)
            if (!folder) throw createAppError('MAIL_FOLDER_NOT_FOUND')
            await deps.accountService.getById(folder.accountId, userId)
            accountId = folder.accountId
        } else if (params.accountId) {
            await deps.accountService.getById(params.accountId, userId)
            accountId = params.accountId
        } else {
            throw createAppError('VALIDATION_ERROR')
        }

        const unread = await deps.db.getUnreadMessages({ userId, accountId: params.accountId, folderId: params.folderId })
        if (unread.length === 0) return { updated: 0 }

        const grouped = new Map<number, string[]>()
        for (const m of unread) {
            const arr = grouped.get(m.folderId) ?? []
            arr.push(m.remoteMessageId)
            grouped.set(m.folderId, arr)
        }

        try {
            const { provider } = await deps.accountService.getProvider(accountId, userId)
            await provider.connect()
            try {
                for (const [fid, remoteIds] of grouped) {
                    const folder = await deps.db.getFolderById(fid)
                    await provider.markRead(remoteIds, folder?.remoteFolderId).catch(() => {})
                }
            } finally {
                await provider.disconnect().catch(() => {})
            }
        } catch {}

        await deps.db.updateFlags(
            unread.map((m) => m.id),
            { isRead: true },
        )

        await Promise.all(
            [...grouped.keys()].map(async (fid) => {
                const [msgCount, unreadCount] = await Promise.all([deps.db.countMessagesByFolder(fid), deps.db.countUnreadByFolder(fid)])
                await deps.db.updateFolderCounts(fid, msgCount, unreadCount)
            }),
        )

        return { updated: unread.length }
    }

    const markStarred = (userId: string, messageIds: number[]) => applyFlagAction(userId, messageIds, 'markStarred')
    const unmarkStarred = (userId: string, messageIds: number[]) => applyFlagAction(userId, messageIds, 'unmarkStarred')

    const moveToFolder = async (userId: string, messageIds: number[], targetFolderId: number) => {
        const msgInfos = await deps.db.getAccountIdsByMessageIds(messageIds, userId)
        if (msgInfos.length !== messageIds.length) throw createAppError('MAIL_MESSAGE_NOT_FOUND')

        const grouped = new Map<number, { remoteIds: string[]; sourceFolderIds: Set<number> }>()
        for (const info of msgInfos) {
            const group = grouped.get(info.accountId) ?? { remoteIds: [], sourceFolderIds: new Set() }
            group.remoteIds.push(info.remoteMessageId)
            group.sourceFolderIds.add(info.folderId)
            grouped.set(info.accountId, group)
        }

        const targetFolder = await deps.db.getFolderById(targetFolderId)
        if (!targetFolder) throw createAppError('MAIL_FOLDER_NOT_FOUND')

        const accountIds = [...grouped.keys()]
        if (!accountIds.includes(targetFolder.accountId)) {
            throw createAppError('MAIL_FOLDER_NOT_FOUND')
        }

        for (const [accountId, { remoteIds, sourceFolderIds }] of grouped) {
            try {
                const { provider } = await deps.accountService.getProvider(accountId, userId)
                await provider.connect()
                let sourceFolderRemoteId: string | undefined
                if (sourceFolderIds.size === 1) {
                    const sourceFolder = await deps.db.getFolderById([...sourceFolderIds][0])
                    sourceFolderRemoteId = sourceFolder?.remoteFolderId
                }
                await provider.moveMessage(remoteIds, targetFolder?.remoteFolderId ?? targetFolderId.toString(), sourceFolderRemoteId)
                await provider.disconnect()
            } catch {}
        }

        await deps.db.moveToFolder(messageIds, targetFolderId)
    }

    const deleteMessages = async (userId: string, messageIds: number[]) => {
        const msgInfos = await deps.db.getAccountIdsByMessageIds(messageIds, userId)
        if (msgInfos.length !== messageIds.length) throw createAppError('MAIL_MESSAGE_NOT_FOUND')

        const grouped = new Map<number, string[]>()
        for (const info of msgInfos) {
            const arr = grouped.get(info.accountId) ?? []
            arr.push(info.remoteMessageId)
            grouped.set(info.accountId, arr)
        }

        for (const [accountId, remoteIds] of grouped) {
            try {
                const { provider } = await deps.accountService.getProvider(accountId, userId)
                await provider.connect()
                await provider.deleteMessage(remoteIds)
                await provider.disconnect()
            } catch {}
        }

        await deps.db.deleteMessages(messageIds)
    }

    const search = async (userId: string, query: { q: string; accountId?: number; page?: number; limit?: number }) => {
        return deps.db.search({
            q: query.q,
            accountId: query.accountId,
            userId,
            page: query.page ?? 1,
            limit: query.limit ?? 20,
        })
    }

    const downloadAttachment = async (userId: string, messageId: number, attachmentId: number) => {
        const msg = await getById(userId, messageId)
        const attachment = await deps.db.getAttachment(attachmentId)
        if (!attachment || attachment.messageId !== messageId) throw createAppError('MAIL_ATTACHMENT_NOT_FOUND')

        if (attachment.r2Key && deps.storageService) {
            try {
                const cached = await deps.storageService.download(attachment.r2Key)
                if (cached) {
                    return {
                        content: cached,
                        filename: attachment.filename ?? 'attachment',
                        mimeType: attachment.mimeType ?? 'application/octet-stream',
                    }
                }
            } catch (error) {
                console.error('[mail] cached attachment read failed, refetching from provider', {
                    attachmentId,
                    reason: error instanceof Error ? error.message : 'unknown',
                })
            }
        }

        if (!attachment.remoteAttachmentId) throw createAppError('MAIL_ATTACHMENT_NOT_FOUND')

        let data: AttachmentData
        try {
            const { provider } = await deps.accountService.getProvider(msg.accountId, userId)
            await provider.connect()
            try {
                data = await provider.downloadAttachment(msg.remoteMessageId, attachment.remoteAttachmentId)
            } finally {
                await provider.disconnect().catch(() => {})
            }
        } catch (error) {
            if (isAppError(error)) throw error
            console.error('[mail] attachment download failed', {
                messageId,
                attachmentId,
                reason: error instanceof Error ? error.message : 'unknown',
            })
            throw createAppError('MAIL_ATTACHMENT_DOWNLOAD_FAILED', {
                message: maskProviderError(error instanceof Error ? error.message : 'Unknown error'),
            })
        }

        const filename = attachment.filename ?? data.filename
        const mimeType = attachment.mimeType ?? data.mimeType

        if (deps.storageService) {
            try {
                const r2Key = `mail/attachments/${messageId}/${attachmentId}/${sanitizeFilename(filename)}`
                await deps.storageService.upload(r2Key, data.content, mimeType)
                await deps.db.updateAttachmentR2Key(attachmentId, r2Key)
            } catch (error) {
                console.error('[mail] attachment cache write failed, returning content anyway', {
                    attachmentId,
                    reason: error instanceof Error ? error.message : 'unknown',
                })
            }
        }

        return { content: data.content, filename, mimeType }
    }

    const send = async (userId: string, accountId: number, data: ComposeEmailData) => {
        if (data.attachmentIds?.length && deps.uploadService) {
            const resolved = await deps.uploadService.resolveForSend(data.attachmentIds, userId)
            data = { ...data, attachments: resolved }
        }

        const { provider } = await deps.accountService.getProvider(accountId, userId)
        try {
            await provider.connect()
            const result = await provider.sendMessage(data)
            await provider.disconnect()
            return result
        } catch (error) {
            await provider.disconnect().catch(() => {})
            throw createAppError('MAIL_SEND_FAILED', {
                message: maskProviderError(error instanceof Error ? error.message : 'Unknown error'),
            })
        }
    }

    const reply = async (
        userId: string,
        messageId: number,
        data: {
            bodyHtml?: string
            bodyText?: string
            to?: EmailAddress[]
            cc?: EmailAddress[]
            attachmentIds?: number[]
        },
    ) => {
        const original = await getById(userId, messageId)

        const to = data.to ?? (original.fromAddress ? [original.fromAddress] : [])
        const inReplyTo = original.messageIdHeader ?? undefined
        const references = [original.referencesHeader, original.messageIdHeader].filter(Boolean).join(' ') || undefined

        return send(userId, original.accountId, {
            to,
            cc: data.cc,
            subject: sanitizeHeaderValue(`Re: ${original.subject ?? ''}`),
            bodyHtml: data.bodyHtml,
            bodyText: data.bodyText,
            inReplyTo,
            references,
            attachmentIds: data.attachmentIds,
        })
    }

    const forward = async (
        userId: string,
        messageId: number,
        data: {
            to: EmailAddress[]
            cc?: EmailAddress[]
            bcc?: EmailAddress[]
            bodyHtml?: string
            attachmentIds?: number[]
        },
    ) => {
        const original = await getById(userId, messageId)

        const body = data.bodyHtml ?? original.bodyHtml ?? original.bodyText ?? ''
        const forwardBody = `<br/><br/>---------- Forwarded message ----------<br/>From: ${escapeHtml(original.fromAddress?.address ?? '')}<br/>Subject: ${escapeHtml(original.subject ?? '')}<br/><br/>${body}`

        return send(userId, original.accountId, {
            to: data.to,
            cc: data.cc,
            bcc: data.bcc,
            subject: sanitizeHeaderValue(`Fwd: ${original.subject ?? ''}`),
            bodyHtml: forwardBody,
            attachmentIds: data.attachmentIds,
        })
    }

    const getSenderList = async (userId: string, query: { accountId?: number; limit?: number }) => {
        return deps.db.getSenderList({
            userId,
            accountId: query.accountId,
            limit: query.limit ?? 10000,
        })
    }

    return {
        list,
        getById,
        getThread,
        markRead,
        markUnread,
        markAllRead,
        markStarred,
        unmarkStarred,
        moveToFolder,
        deleteMessages,
        search,
        downloadAttachment,
        send,
        reply,
        forward,
        getSenderList,
    }
}

export type MailMessageService = ReturnType<typeof createMailMessageService>
