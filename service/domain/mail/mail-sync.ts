import type { MailSyncLog, MailSyncSession, MailFolder } from '../../../db/schema'
import type { MailAccountService } from './mail-account'
import type { MailProvider, ProviderMessage } from './mail-provider'
import { createAppError, describeThrownError } from '../../../lib/error'
import { captureException } from '../../../lib/sentry'
import { isLocalMailFolder, maskProviderError } from '../../../lib/mail-utils'

type MailSyncDb = {
    upsertFolder: (data: {
        accountId: number
        remoteFolderId: string
        name: string
        type: string
        parentId: number | null
        messageCount: number
        unreadCount: number
        uidValidity: number | null
    }) => Promise<MailFolder>
    getFoldersByAccount: (accountId: number) => Promise<MailFolder[]>
    getFolderById: (id: number) => Promise<MailFolder | null>
    updateFolderCounts: (folderId: number, messageCount: number, unreadCount: number) => Promise<void>
    updateFolderSyncCursor: (folderId: number, cursor: string | null) => Promise<void>

    upsertMessages: (params: {
        accountId: number
        folderId: number
        identityScope: 'account' | 'folder'
        messages: {
            remoteMessageId: string
            messageIdHeader: string | null
            threadId: string | null
            inReplyTo: string | null
            referencesHeader: string | null
            fromAddress: { name: string; address: string } | null
            toAddresses: { name: string; address: string }[]
            ccAddresses: { name: string; address: string }[]
            bccAddresses: { name: string; address: string }[]
            subject: string | null
            bodyHtml: string | null
            bodyText: string | null
            snippet: string | null
            isRead: boolean
            isStarred: boolean
            isDraft: boolean
            hasAttachments: boolean
            sentAt: Date | null
            receivedAt: Date | null
            uid: number | null
        }[]
    }) => Promise<{ id: number | null; isNew: boolean }[]>
    deleteMessagesByRemoteIds: (params: {
        accountId: number
        folderId: number
        identityScope: 'account' | 'folder'
        remoteIds: string[]
    }) => Promise<void>

    upsertAttachments: (
        items: {
            messageId: number | null
            remoteAttachmentId: string | null
            filename: string | null
            mimeType: string | null
            sizeBytes: number | null
            contentId: string | null
            isInline: boolean
        }[],
    ) => Promise<void>

    createSyncLog: (data: { accountId: number; syncType: string; status: string; folderId: number | null; startedAt: Date }) => Promise<MailSyncLog>
    updateSyncLog: (
        id: number,
        data: {
            status: string
            messagesAdded?: number
            messagesUpdated?: number
            messagesDeleted?: number
            durationMs?: number
            errorMessage?: string
            completedAt?: Date
        },
    ) => Promise<void>
    getLatestSyncLog: (accountId: number) => Promise<MailSyncLog | null>

    tryAcquireSyncLock: (accountId: number, staleMs: number) => Promise<boolean>
    releaseSyncLock: (accountId: number) => Promise<void>

    getActiveSession: (accountId: number) => Promise<MailSyncSession | null>
    createSession: (data: {
        accountId: number
        folderId: number | null
        syncType: string
        status: string
        totalEstimate: number | null
        startedAt: Date
    }) => Promise<MailSyncSession>
    updateSession: (
        id: number,
        data: { status?: string; syncedCount?: number; cursor?: string; totalEstimate?: number; lastBatchAt?: Date; completedAt?: Date },
    ) => Promise<void>

    countsByFolder: (folderId: number) => Promise<{ messageCount: number; unreadCount: number }>
}

type MailSyncServiceDeps = {
    db: MailSyncDb
    accountService: MailAccountService
}

const SESSION_STALE_MS = 30 * 60 * 1000
const SYNC_LOCK_STALE_MS = 5 * 60 * 1000
const GMAIL_PROVIDER = 'gmail'
const MESSAGE_HEADER_MAX_LENGTH = 500
const REMOTE_FOLDER_ID_MAX_LENGTH = 255
const ATTACHMENT_FILENAME_MAX_LENGTH = 255
const ATTACHMENT_MIME_TYPE_MAX_LENGTH = 100
const ATTACHMENT_CONTENT_ID_MAX_LENGTH = 255
const SYNC_ERROR_MESSAGE_MAX_LENGTH = 2000

const truncate = (value: string | null | undefined, maxLength: number) => (value == null ? null : value.slice(0, maxLength))

export const createMailSyncService = (deps: MailSyncServiceDeps) => {
    const upsertMessagesFromProvider = async (
        accountId: number,
        folderId: number,
        messages: ProviderMessage[],
        identityScope: 'account' | 'folder',
    ): Promise<{ added: number; updated: number }> => {
        if (messages.length === 0) return { added: 0, updated: 0 }

        const results = await deps.db.upsertMessages({
            accountId,
            folderId,
            identityScope,
            messages: messages.map((msg) => ({
                remoteMessageId: msg.id,
                messageIdHeader: truncate(msg.messageIdHeader, MESSAGE_HEADER_MAX_LENGTH),
                threadId: msg.threadId ?? null,
                inReplyTo: truncate(msg.inReplyTo, MESSAGE_HEADER_MAX_LENGTH),
                referencesHeader: msg.references ?? null,
                fromAddress: msg.from,
                toAddresses: msg.to,
                ccAddresses: msg.cc,
                bccAddresses: msg.bcc,
                subject: msg.subject,
                bodyHtml: msg.bodyHtml,
                bodyText: msg.bodyText,
                snippet: msg.snippet,
                isRead: msg.isRead,
                isStarred: msg.isStarred,
                isDraft: msg.isDraft,
                hasAttachments: msg.attachments.length > 0,
                sentAt: msg.sentAt,
                receivedAt: msg.receivedAt,
                uid: msg.uid ?? null,
            })),
        })

        let added = 0
        let updated = 0
        const attachments: Parameters<MailSyncDb['upsertAttachments']>[0] = []

        for (const [index, msg] of messages.entries()) {
            const result = results[index]
            if (result?.isNew) added++
            else updated++

            const messageId = result?.id ?? null
            if (messageId === null) {
                if (msg.attachments.length > 0)
                    captureException(createAppError('INTERNAL_ERROR', { detail: 'mail upsert returned no id', remoteMessageId: msg.id }))
                continue
            }

            for (const att of msg.attachments) {
                attachments.push({
                    messageId,
                    remoteAttachmentId: att.id,
                    filename: truncate(att.filename, ATTACHMENT_FILENAME_MAX_LENGTH),
                    mimeType: truncate(att.mimeType, ATTACHMENT_MIME_TYPE_MAX_LENGTH),
                    sizeBytes: att.sizeBytes,
                    contentId: truncate(att.contentId, ATTACHMENT_CONTENT_ID_MAX_LENGTH),
                    isInline: att.isInline,
                })
            }
        }

        if (attachments.length > 0) await deps.db.upsertAttachments(attachments)

        return { added, updated }
    }

    const syncFolder = async (provider: MailProvider, accountId: number, accountProvider: string, folder: MailFolder, fallbackCursor?: string) => {
        const identityScope = accountProvider === GMAIL_PROVIDER ? 'account' : 'folder'
        const cursor = folder.syncCursor ?? fallbackCursor ?? undefined
        const result = await provider.fetchMessages({
            folderId: folder.remoteFolderId,
            cursor,
            batchSize: 100,
        })

        const { added, updated } = await upsertMessagesFromProvider(accountId, folder.id, result.messages, identityScope)

        if (result.deletedIds.length > 0) {
            await deps.db.deleteMessagesByRemoteIds({ accountId, folderId: folder.id, identityScope, remoteIds: result.deletedIds })
        }

        if (result.newSyncCursor) {
            await deps.db.updateFolderSyncCursor(folder.id, result.newSyncCursor)
        }

        const counts = await deps.db.countsByFolder(folder.id)
        await deps.db.updateFolderCounts(folder.id, counts.messageCount, counts.unreadCount)

        return { added, updated, deleted: result.deletedIds.length }
    }

    const syncAccount = async (accountId: number, userId: string, folderId?: number) => {
        const { provider, account } = await deps.accountService.getProvider(accountId, userId)
        const startTime = Date.now()

        const isLockAcquired = await deps.db.tryAcquireSyncLock(accountId, SYNC_LOCK_STALE_MS)
        if (!isLockAcquired) return { added: 0, updated: 0, deleted: 0, durationMs: Date.now() - startTime }

        try {
            const existingSession = await deps.db.getActiveSession(accountId)
            if (existingSession?.status === 'running') {
                await deps.db.updateSession(existingSession.id, { status: 'error' })
            }

            const syncType = folderId ? 'folder' : 'incremental'

            const syncLog = await deps.db.createSyncLog({
                accountId,
                syncType,
                status: 'running',
                folderId: folderId ?? null,
                startedAt: new Date(),
            })

            try {
                await provider.connect()

                const existingFolders = await deps.db.getFoldersByAccount(accountId)
                const isIncremental = existingFolders.some((f) => f.syncCursor)

                const folders = await provider.fetchFolders({ includeCounts: !isIncremental })
                await Promise.all(
                    folders.map((f) =>
                        deps.db.upsertFolder({
                            accountId,
                            remoteFolderId: f.id.slice(0, REMOTE_FOLDER_ID_MAX_LENGTH),
                            name: f.name,
                            type: f.type,
                            parentId: null,
                            messageCount: f.messageCount,
                            unreadCount: f.unreadCount,
                            uidValidity: f.uidValidity ?? null,
                        }),
                    ),
                )

                const dbFolders = await deps.db.getFoldersByAccount(accountId)

                let totalAdded = 0
                let totalUpdated = 0
                let totalDeleted = 0

                const syncableFolders = dbFolders.filter((f) => !isLocalMailFolder(f.remoteFolderId))
                const foldersToSync = folderId ? syncableFolders.filter((f) => f.id === folderId) : syncableFolders

                if (isIncremental) {
                    const results = await Promise.allSettled(
                        foldersToSync.map((folder) => syncFolder(provider, accountId, account.provider, folder, account.syncCursor ?? undefined)),
                    )
                    for (const r of results) {
                        if (r.status !== 'fulfilled') continue
                        totalAdded += r.value.added
                        totalUpdated += r.value.updated
                        totalDeleted += r.value.deleted
                    }
                    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
                    if (failed) throw failed.reason
                } else {
                    for (const folder of foldersToSync) {
                        const r = await syncFolder(provider, accountId, account.provider, folder, account.syncCursor ?? undefined)
                        totalAdded += r.added
                        totalUpdated += r.updated
                        totalDeleted += r.deleted
                    }
                }

                const durationMs = Date.now() - startTime
                await deps.db.updateSyncLog(syncLog.id, {
                    status: 'success',
                    messagesAdded: totalAdded,
                    messagesUpdated: totalUpdated,
                    messagesDeleted: totalDeleted,
                    durationMs,
                    completedAt: new Date(),
                })

                await deps.accountService.updateSyncStatus(accountId, 'success')

                return { added: totalAdded, updated: totalUpdated, deleted: totalDeleted, durationMs }
            } catch (error) {
                const durationMs = Date.now() - startTime
                const errorMessage = describeThrownError(error).slice(0, SYNC_ERROR_MESSAGE_MAX_LENGTH)

                try {
                    await deps.db.updateSyncLog(syncLog.id, {
                        status: 'error',
                        durationMs,
                        errorMessage,
                        completedAt: new Date(),
                    })
                    await deps.accountService.updateSyncStatus(accountId, 'error')
                } catch (logError) {
                    captureException(logError)
                }
                throw createAppError('MAIL_PROVIDER_ERROR', { message: maskProviderError(errorMessage) })
            } finally {
                await provider.disconnect().catch(captureException)
            }
        } finally {
            await deps.db.releaseSyncLock(accountId).catch(captureException)
        }
    }

    const syncHistorical = async (
        accountId: number,
        userId: string,
        options: {
            folderId?: number
            batchSize?: number
            cursor?: string
        },
    ) => {
        const { provider, account } = await deps.accountService.getProvider(accountId, userId)
        const batchSize = options.batchSize ?? 100

        let session = await deps.db.getActiveSession(accountId)
        if (session?.status === 'running') {
            await deps.db.updateSession(session.id, { status: 'error' })
            session = null
        }

        try {
            await provider.connect()

            let targetFolderId = options.folderId
            if (!targetFolderId) {
                const folders = await provider.fetchFolders()
                await Promise.all(
                    folders.map((f) =>
                        deps.db.upsertFolder({
                            accountId,
                            remoteFolderId: f.id.slice(0, REMOTE_FOLDER_ID_MAX_LENGTH),
                            name: f.name,
                            type: f.type,
                            parentId: null,
                            messageCount: f.messageCount,
                            unreadCount: f.unreadCount,
                            uidValidity: f.uidValidity ?? null,
                        }),
                    ),
                )

                const dbFolders = (await deps.db.getFoldersByAccount(accountId)).filter((f) => !isLocalMailFolder(f.remoteFolderId))
                const inbox = dbFolders.find((f) => f.type === 'inbox')
                targetFolderId = inbox?.id ?? dbFolders[0]?.id
            }

            if (!targetFolderId) throw createAppError('MAIL_FOLDER_NOT_FOUND')

            const folder = await deps.db.getFolderById(targetFolderId)
            if (!folder || folder.accountId !== accountId || isLocalMailFolder(folder.remoteFolderId)) throw createAppError('MAIL_FOLDER_NOT_FOUND')

            if (session && session.folderId !== targetFolderId) session = null

            const cursor = options.cursor ?? session?.cursor ?? undefined

            if (!session) {
                session = await deps.db.createSession({
                    accountId,
                    folderId: targetFolderId,
                    syncType: 'historical',
                    status: 'running',
                    totalEstimate: null,
                    startedAt: new Date(),
                })
            } else {
                await deps.db.updateSession(session.id, { status: 'running', lastBatchAt: new Date() })
            }

            const result = await provider.fetchMessages({
                folderId: folder.remoteFolderId,
                cursor,
                batchSize,
                direction: 'backward',
            })

            const identityScope = account.provider === GMAIL_PROVIDER ? 'account' : 'folder'
            const { added } = await upsertMessagesFromProvider(accountId, folder.id, result.messages, identityScope)

            const syncedSoFar = (session.syncedCount ?? 0) + added
            const totalEstimate = result.totalEstimate ?? session.totalEstimate ?? null

            await deps.db.updateSession(session.id, {
                syncedCount: syncedSoFar,
                cursor: result.newSyncCursor ?? undefined,
                totalEstimate: totalEstimate ?? undefined,
                lastBatchAt: new Date(),
                status: result.newSyncCursor ? 'paused' : 'completed',
                ...(result.newSyncCursor ? {} : { completedAt: new Date() }),
            })

            const counts = await deps.db.countsByFolder(folder.id)
            await deps.db.updateFolderCounts(folder.id, counts.messageCount, counts.unreadCount)

            return {
                synced: added,
                totalEstimate,
                syncedSoFar,
                cursor: result.newSyncCursor,
                hasMore: !!result.newSyncCursor,
                folderId: targetFolderId,
                sessionId: session.id,
            }
        } catch (error) {
            if (session) {
                await deps.db.updateSession(session.id, { status: 'error' })
            }

            if (error && typeof error === 'object' && 'code' in error) throw error
            throw createAppError('MAIL_PROVIDER_ERROR', {
                message: maskProviderError(describeThrownError(error).slice(0, SYNC_ERROR_MESSAGE_MAX_LENGTH)),
            })
        } finally {
            await provider.disconnect().catch(captureException)
        }
    }

    const getSyncStatus = async (accountId: number, userId: string) => {
        const account = await deps.accountService.getById(accountId, userId)
        const latestLog = await deps.db.getLatestSyncLog(accountId)
        let activeSession = await deps.db.getActiveSession(accountId)

        if (activeSession) {
            const lastActivity = activeSession.lastBatchAt ?? activeSession.startedAt
            const isStale = !lastActivity || Date.now() - lastActivity.getTime() > SESSION_STALE_MS
            if (isStale) {
                await deps.db.updateSession(activeSession.id, { status: 'error', completedAt: new Date() })
                activeSession = null
            }
        }

        const historicalSync = activeSession
            ? {
                  status: activeSession.status,
                  totalEstimate: activeSession.totalEstimate,
                  syncedCount: activeSession.syncedCount,
                  progressPercent: activeSession.totalEstimate
                      ? Math.round(((activeSession.syncedCount ?? 0) / activeSession.totalEstimate) * 1000) / 10
                      : null,
                  startedAt: activeSession.startedAt,
              }
            : null

        return {
            accountId: account.id,
            lastSyncAt: account.lastSyncAt,
            lastSyncStatus: account.lastSyncStatus,
            historicalSync,
            latestLog: latestLog
                ? {
                      id: latestLog.id,
                      syncType: latestLog.syncType,
                      status: latestLog.status,
                      messagesAdded: latestLog.messagesAdded,
                      messagesUpdated: latestLog.messagesUpdated,
                      messagesDeleted: latestLog.messagesDeleted,
                      durationMs: latestLog.durationMs,
                      startedAt: latestLog.startedAt,
                      completedAt: latestLog.completedAt,
                  }
                : null,
        }
    }

    return { syncAccount, syncHistorical, getSyncStatus }
}

export type MailSyncService = ReturnType<typeof createMailSyncService>
