import type { MailSyncLog, MailSyncSession, MailFolder, MailMessage, MailAttachment } from '../../../db/schema'
import type { MailAccountService } from './mail-account'
import type { MailProvider, ProviderMessage } from './mail-provider'
import { createAppError } from '../../../lib/error'
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

    upsertMessage: (data: {
        accountId: number
        folderId: number
        identityScope: 'account' | 'folder'
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
    }) => Promise<MailMessage & { isNew: boolean }>
    deleteMessagesByRemoteIds: (params: {
        accountId: number
        folderId: number
        identityScope: 'account' | 'folder'
        remoteIds: string[]
    }) => Promise<void>

    upsertAttachment: (data: {
        messageId: number
        remoteAttachmentId: string | null
        filename: string | null
        mimeType: string | null
        sizeBytes: number | null
        contentId: string | null
        isInline: boolean
    }) => Promise<MailAttachment>

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

    countMessagesByFolder: (folderId: number) => Promise<number>
    countUnreadByFolder: (folderId: number) => Promise<number>
}

type MailSyncServiceDeps = {
    db: MailSyncDb
    accountService: MailAccountService
}

const SESSION_STALE_MS = 30 * 60 * 1000
const GMAIL_PROVIDER = 'gmail'

export const createMailSyncService = (deps: MailSyncServiceDeps) => {
    const yieldEventLoop = () => new Promise<void>((r) => setTimeout(r, 0))

    const upsertMessagesFromProvider = async (
        accountId: number,
        folderId: number,
        messages: ProviderMessage[],
        identityScope: 'account' | 'folder',
    ): Promise<{ added: number; updated: number }> => {
        let added = 0
        let updated = 0

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i]
            const dbMsg = await deps.db.upsertMessage({
                accountId,
                folderId,
                identityScope,
                remoteMessageId: msg.id,
                messageIdHeader: msg.messageIdHeader ?? null,
                threadId: msg.threadId ?? null,
                inReplyTo: msg.inReplyTo ?? null,
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
            })

            if (dbMsg.isNew) added++
            else updated++

            for (const att of msg.attachments) {
                await deps.db.upsertAttachment({
                    messageId: dbMsg.id,
                    remoteAttachmentId: att.id,
                    filename: att.filename,
                    mimeType: att.mimeType,
                    sizeBytes: att.sizeBytes,
                    contentId: att.contentId,
                    isInline: att.isInline,
                })
            }

            if (i % 10 === 9) await yieldEventLoop()
        }

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

        const [msgCount, unreadCount] = await Promise.all([deps.db.countMessagesByFolder(folder.id), deps.db.countUnreadByFolder(folder.id)])
        await deps.db.updateFolderCounts(folder.id, msgCount, unreadCount)

        return { added, updated, deleted: result.deletedIds.length }
    }

    const syncAccount = async (accountId: number, userId: string, folderId?: number) => {
        const existingSession = await deps.db.getActiveSession(accountId)
        if (existingSession?.status === 'running') {
            await deps.db.updateSession(existingSession.id, { status: 'error' })
        }

        const { provider, account } = await deps.accountService.getProvider(accountId, userId)
        const startTime = Date.now()
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
                        remoteFolderId: f.id,
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
                const results = await Promise.all(
                    foldersToSync.map((folder) => syncFolder(provider, accountId, account.provider, folder, account.syncCursor ?? undefined)),
                )
                for (const r of results) {
                    totalAdded += r.added
                    totalUpdated += r.updated
                    totalDeleted += r.deleted
                }
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
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'

            await deps.db.updateSyncLog(syncLog.id, {
                status: 'error',
                durationMs,
                errorMessage,
                completedAt: new Date(),
            })

            await deps.accountService.updateSyncStatus(accountId, 'error')
            throw createAppError('MAIL_PROVIDER_ERROR', { message: maskProviderError(errorMessage) })
        } finally {
            await provider.disconnect().catch(captureException)
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
                            remoteFolderId: f.id,
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
            if (!folder || isLocalMailFolder(folder.remoteFolderId)) throw createAppError('MAIL_FOLDER_NOT_FOUND')

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

            const [msgCount, unreadCount] = await Promise.all([deps.db.countMessagesByFolder(folder.id), deps.db.countUnreadByFolder(folder.id)])
            await deps.db.updateFolderCounts(folder.id, msgCount, unreadCount)

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
                message: maskProviderError(error instanceof Error ? error.message : 'Unknown error'),
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
