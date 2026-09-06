import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from 'drizzle-orm'
import * as schema from '../db/schema'
import { escapeLikePattern } from '../lib/sql-utils'
import { isDuplicateKeyError } from '../lib/db-helper'
import { captureException } from '../lib/sentry'
import { createMailCrypto } from '../service/domain/mail/mail-crypto'
import { createMailProviderFactory } from '../service/domain/mail/mail-provider-factory'
import { createMailAccountService } from '../service/domain/mail/mail-account'
import { createMailSyncService } from '../service/domain/mail/mail-sync'
import { createMailMessageService } from '../service/domain/mail/mail-message'
import { createMailDraftService } from '../service/domain/mail/mail-draft'
import { createMailUploadService } from '../service/domain/mail/mail-upload'
import { createMailOAuthConnectService } from '../service/domain/mail/mail-oauth-connect'
import { createRateLimiter } from '../lib/rate-limit'
import type { ComposeMailArgs } from './types'

const SYNC_LOCK_HELD_STATUS = 'running'
const SYNC_LOCK_INTERRUPTED_STATUS = 'error'

export const composeMail = ({ db, env, storageService, rateLimitStore }: ComposeMailArgs) => {
    if (!env.MAIL_ENCRYPTION_KEY) {
        throw new Error('MAIL_ENCRYPTION_KEY is required for mail functionality')
    }
    const mailCrypto = createMailCrypto(env.MAIL_ENCRYPTION_KEY)

    const verifyBetterAuthOwnership = async (betterAuthAccountId: string, userId: string): Promise<boolean> => {
        const [acc] = await db
            .select({ userId: schema.account.userId })
            .from(schema.account)
            .where(and(eq(schema.account.id, betterAuthAccountId), eq(schema.account.userId, userId)))
            .limit(1)
        return !!acc
    }

    const mailProviderFactory = createMailProviderFactory({
        crypto: mailCrypto,
        getOAuthToken: async (betterAuthAccountId: string, userId: string) => {
            const [acc] = await db
                .select({ accessToken: schema.account.accessToken, refreshToken: schema.account.refreshToken })
                .from(schema.account)
                .where(and(eq(schema.account.id, betterAuthAccountId), eq(schema.account.userId, userId)))
                .limit(1)
            if (!acc?.accessToken) return null
            return { accessToken: acc.accessToken, refreshToken: acc.refreshToken ?? undefined }
        },
        refreshOAuthToken: async (betterAuthAccountId: string, refreshToken: string, userId: string) => {
            const res = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: env.GOOGLE_CLIENT_ID ?? '',
                    client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token',
                }),
            })
            if (!res.ok) {
                const errorBody = await res.text().catch(() => 'unknown')
                throw new Error(`OAuth token refresh failed (${res.status}): ${errorBody}`)
            }
            const data = (await res.json()) as { access_token: string; expires_in: number }
            if (!data.access_token || typeof data.expires_in !== 'number') {
                throw new Error('Invalid OAuth token response')
            }
            await db
                .update(schema.account)
                .set({
                    accessToken: data.access_token,
                    accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
                })
                .where(and(eq(schema.account.id, betterAuthAccountId), eq(schema.account.userId, userId)))
            return data.access_token
        },
    })

    const mailAccountDb = {
        list: async (userId: string) => {
            return db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.userId, userId))
        },
        getById: async (id: number) => {
            const [account] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.id, id)).limit(1)
            return account ?? null
        },
        insert: async (data: typeof schema.mailAccounts.$inferInsert) => {
            try {
                const [result] = await db.insert(schema.mailAccounts).values(data).$returningId()
                return result
            } catch (error) {
                if (isDuplicateKeyError(error)) return null
                throw error
            }
        },
        update: async (
            id: number,
            data: Partial<Pick<schema.MailAccount, 'displayName' | 'signature' | 'isActive' | 'lastSyncAt' | 'lastSyncStatus' | 'syncCursor'>>,
        ) => {
            await db.update(schema.mailAccounts).set(data).where(eq(schema.mailAccounts.id, id))
        },
        remove: async (id: number) => {
            await db.delete(schema.mailAccounts).where(eq(schema.mailAccounts.id, id))
        },
        countByUser: async (userId: string) => {
            const [result] = await db
                .select({ count: sql<number>`COUNT(*)` })
                .from(schema.mailAccounts)
                .where(eq(schema.mailAccounts.userId, userId))
            return result?.count ?? 0
        },
    }

    const mailAccountService = createMailAccountService({
        db: mailAccountDb,
        crypto: mailCrypto,
        providerFactory: mailProviderFactory,
        verifyBetterAuthOwnership,
    })

    const mailOAuthConnect = createMailOAuthConnectService({
        googleClientId: env.GOOGLE_CLIENT_ID ?? '',
        googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
        secret: env.BETTER_AUTH_SECRET ?? '',
        findAccountByProviderAndUser: async (providerId: string, userId: string, accountId: string) => {
            const [acc] = await db
                .select({ id: schema.account.id })
                .from(schema.account)
                .where(and(eq(schema.account.providerId, providerId), eq(schema.account.userId, userId), eq(schema.account.accountId, accountId)))
                .limit(1)
            return acc ?? null
        },
        upsertAccount: async (data) => {
            const updateSet: Record<string, unknown> = {
                accessToken: data.accessToken,
                accessTokenExpiresAt: data.accessTokenExpiresAt,
                scope: data.scope,
                updatedAt: new Date(),
            }
            if (data.refreshToken !== undefined) {
                updateSet.refreshToken = data.refreshToken
            }

            await db
                .insert(schema.account)
                .values({
                    id: data.id,
                    accountId: data.accountId,
                    providerId: data.providerId,
                    userId: data.userId,
                    accessToken: data.accessToken,
                    refreshToken: data.refreshToken ?? null,
                    accessTokenExpiresAt: data.accessTokenExpiresAt,
                    scope: data.scope,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                } as never)
                .onDuplicateKeyUpdate({ set: updateSet as never })
            return { id: data.id }
        },
        findMailAccountByEmail: async (userId: string, email: string) => {
            const [acc] = await db
                .select({ id: schema.mailAccounts.id, betterAuthAccountId: schema.mailAccounts.betterAuthAccountId })
                .from(schema.mailAccounts)
                .where(and(eq(schema.mailAccounts.userId, userId), eq(schema.mailAccounts.email, email)))
                .limit(1)
            return acc ?? null
        },
        createMailAccount: async (userId: string, input: { provider: string; email: string; betterAuthAccountId: string }) => {
            return mailAccountService.create(userId, input)
        },
        updateMailAccountBetterAuthId: async (id: number, betterAuthAccountId: string) => {
            await db
                .update(schema.mailAccounts)
                .set({ betterAuthAccountId } as never)
                .where(eq(schema.mailAccounts.id, id))
        },
    })

    const mailSyncDb = {
        upsertFolder: async (data: {
            accountId: number
            remoteFolderId: string
            name: string
            type: string
            parentId: number | null
            messageCount: number
            unreadCount: number
            uidValidity: number | null
        }) => {
            await db
                .insert(schema.mailFolders)
                .values({
                    accountId: data.accountId,
                    remoteFolderId: data.remoteFolderId,
                    name: data.name,
                    type: data.type,
                    parentId: data.parentId,
                    messageCount: data.messageCount,
                    unreadCount: data.unreadCount,
                    uidValidity: data.uidValidity,
                })
                .onDuplicateKeyUpdate({
                    set: {
                        name: data.name,
                        type: data.type,
                        uidValidity: data.uidValidity,
                    },
                })
            const [folder] = await db
                .select()
                .from(schema.mailFolders)
                .where(and(eq(schema.mailFolders.accountId, data.accountId), eq(schema.mailFolders.remoteFolderId, data.remoteFolderId)))
                .limit(1)
            return folder
        },
        getFoldersByAccount: async (accountId: number) => {
            return db.select().from(schema.mailFolders).where(eq(schema.mailFolders.accountId, accountId))
        },
        getFolderById: async (id: number) => {
            const [folder] = await db.select().from(schema.mailFolders).where(eq(schema.mailFolders.id, id)).limit(1)
            return folder ?? null
        },
        updateFolderCounts: async (folderId: number, messageCount: number, unreadCount: number) => {
            await db.update(schema.mailFolders).set({ messageCount, unreadCount }).where(eq(schema.mailFolders.id, folderId))
        },
        updateFolderSyncCursor: async (folderId: number, cursor: string | null) => {
            await db.update(schema.mailFolders).set({ syncCursor: cursor }).where(eq(schema.mailFolders.id, folderId))
        },

        upsertMessage: async (data: Record<string, unknown>) => {
            const { identityScope, ...insertData } = data
            const isAccountScope = identityScope === 'account'
            const messageIdentity = isAccountScope
                ? and(
                      eq(schema.mailMessages.accountId, data.accountId as number),
                      eq(schema.mailMessages.remoteMessageId, data.remoteMessageId as string),
                  )
                : and(
                      eq(schema.mailMessages.accountId, data.accountId as number),
                      eq(schema.mailMessages.folderId, data.folderId as number),
                      eq(schema.mailMessages.remoteMessageId, data.remoteMessageId as string),
                  )
            const [existing] = await db.select({ id: schema.mailMessages.id }).from(schema.mailMessages).where(messageIdentity).limit(1)
            const isNew = !existing

            const mutableFields = {
                subject: data.subject,
                bodyHtml: data.bodyHtml,
                bodyText: data.bodyText,
                snippet: data.snippet,
                isRead: data.isRead,
                isStarred: data.isStarred,
                isDraft: data.isDraft,
                hasAttachments: data.hasAttachments,
                threadId: data.threadId,
                messageIdHeader: data.messageIdHeader,
                inReplyTo: data.inReplyTo,
                referencesHeader: data.referencesHeader,
            }

            if (existing) {
                await db
                    .update(schema.mailMessages)
                    .set(mutableFields as never)
                    .where(eq(schema.mailMessages.id, existing.id))
                const [updatedMsg] = await db.select().from(schema.mailMessages).where(eq(schema.mailMessages.id, existing.id)).limit(1)
                return { ...updatedMsg, isNew }
            }

            await db
                .insert(schema.mailMessages)
                .values(insertData as never)
                .onDuplicateKeyUpdate({ set: mutableFields as never })

            if (!isAccountScope) {
                const [msg] = await db.select().from(schema.mailMessages).where(messageIdentity).limit(1)
                return { ...msg, isNew }
            }

            const [msg, ...duplicates] = await db.select().from(schema.mailMessages).where(messageIdentity).orderBy(schema.mailMessages.id)
            if (duplicates.length > 0) {
                await db.delete(schema.mailMessages).where(
                    inArray(
                        schema.mailMessages.id,
                        duplicates.map((row) => row.id),
                    ),
                )
            }
            return { ...msg, isNew }
        },
        deleteMessagesByRemoteIds: async (params: {
            accountId: number
            folderId: number
            identityScope: 'account' | 'folder'
            remoteIds: string[]
        }) => {
            if (params.remoteIds.length === 0) return
            const conditions = [eq(schema.mailMessages.accountId, params.accountId)]
            if (params.identityScope !== 'account') conditions.push(eq(schema.mailMessages.folderId, params.folderId))
            conditions.push(inArray(schema.mailMessages.remoteMessageId, params.remoteIds))
            await db.delete(schema.mailMessages).where(and(...conditions))
        },

        upsertAttachment: async (data: Record<string, unknown>) => {
            const { messageId, remoteAttachmentId, ...updateFields } = data
            await db
                .insert(schema.mailAttachments)
                .values(data as never)
                .onDuplicateKeyUpdate({ set: updateFields as never })
            const [att] = await db
                .select()
                .from(schema.mailAttachments)
                .where(
                    and(
                        eq(schema.mailAttachments.messageId, messageId as number),
                        eq(schema.mailAttachments.remoteAttachmentId, remoteAttachmentId as string),
                    ),
                )
                .limit(1)
            return att
        },

        createSyncLog: async (data: { accountId: number; syncType: string; status: string; folderId: number | null; startedAt: Date }) => {
            const [result] = await db
                .insert(schema.mailSyncLogs)
                .values(data as never)
                .$returningId()
            const [log] = await db.select().from(schema.mailSyncLogs).where(eq(schema.mailSyncLogs.id, result.id)).limit(1)
            return log
        },
        updateSyncLog: async (id: number, data: Record<string, unknown>) => {
            await db
                .update(schema.mailSyncLogs)
                .set(data as never)
                .where(eq(schema.mailSyncLogs.id, id))
        },
        getLatestSyncLog: async (accountId: number) => {
            const [log] = await db
                .select()
                .from(schema.mailSyncLogs)
                .where(eq(schema.mailSyncLogs.accountId, accountId))
                .orderBy(desc(schema.mailSyncLogs.createdAt))
                .limit(1)
            return log ?? null
        },

        tryAcquireSyncLock: async (accountId: number, staleMs: number) => {
            const [result] = await db
                .update(schema.mailAccounts)
                .set({ lastSyncStatus: SYNC_LOCK_HELD_STATUS, lastSyncAt: new Date() })
                .where(
                    and(
                        eq(schema.mailAccounts.id, accountId),
                        or(
                            isNull(schema.mailAccounts.lastSyncStatus),
                            ne(schema.mailAccounts.lastSyncStatus, SYNC_LOCK_HELD_STATUS),
                            isNull(schema.mailAccounts.lastSyncAt),
                            lt(schema.mailAccounts.lastSyncAt, new Date(Date.now() - staleMs)),
                        ),
                    ),
                )
            return (result?.affectedRows ?? 0) > 0
        },
        releaseSyncLock: async (accountId: number) => {
            await db
                .update(schema.mailAccounts)
                .set({ lastSyncStatus: SYNC_LOCK_INTERRUPTED_STATUS })
                .where(and(eq(schema.mailAccounts.id, accountId), eq(schema.mailAccounts.lastSyncStatus, SYNC_LOCK_HELD_STATUS)))
        },

        getActiveSession: async (accountId: number) => {
            const [session] = await db
                .select()
                .from(schema.mailSyncSessions)
                .where(and(eq(schema.mailSyncSessions.accountId, accountId), inArray(schema.mailSyncSessions.status, ['running', 'paused'])))
                .orderBy(desc(schema.mailSyncSessions.createdAt))
                .limit(1)
            return session ?? null
        },
        createSession: async (data: {
            accountId: number
            folderId: number | null
            syncType: string
            status: string
            totalEstimate: number | null
            startedAt: Date
        }) => {
            const [result] = await db
                .insert(schema.mailSyncSessions)
                .values(data as never)
                .$returningId()
            const [session] = await db.select().from(schema.mailSyncSessions).where(eq(schema.mailSyncSessions.id, result.id)).limit(1)
            return session
        },
        updateSession: async (id: number, data: Record<string, unknown>) => {
            await db
                .update(schema.mailSyncSessions)
                .set(data as never)
                .where(eq(schema.mailSyncSessions.id, id))
        },

        countMessagesByFolder: async (folderId: number) => {
            const [result] = await db
                .select({ count: sql<number>`COUNT(*)` })
                .from(schema.mailMessages)
                .where(eq(schema.mailMessages.folderId, folderId))
            return result?.count ?? 0
        },
        countUnreadByFolder: async (folderId: number) => {
            const [result] = await db
                .select({ count: sql<number>`COUNT(*)` })
                .from(schema.mailMessages)
                .where(and(eq(schema.mailMessages.folderId, folderId), eq(schema.mailMessages.isRead, false)))
            return result?.count ?? 0
        },
    }

    const mailSyncService = createMailSyncService({
        db: mailSyncDb,
        accountService: mailAccountService,
    })

    let fulltextIndexReady: Promise<boolean> | null = null
    const isFulltextIndexReady = () => {
        if (!fulltextIndexReady) {
            const probe: Promise<boolean> = db
                .execute(
                    sql`SELECT 1 AS present FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mail_messages' AND INDEX_NAME = 'ft_mail_messages_subject_body' LIMIT 1`,
                )
                .then((res) => {
                    const rows = Array.isArray(res) ? res[0] : undefined
                    return Array.isArray(rows) && rows.length > 0
                })
                .catch((error) => {
                    captureException(error)
                    if (fulltextIndexReady === probe) fulltextIndexReady = null
                    return false
                })
            fulltextIndexReady = probe
        }
        return fulltextIndexReady
    }

    const mailMessageListColumns = {
        id: schema.mailMessages.id,
        accountId: schema.mailMessages.accountId,
        folderId: schema.mailMessages.folderId,
        remoteMessageId: schema.mailMessages.remoteMessageId,
        messageIdHeader: schema.mailMessages.messageIdHeader,
        threadId: schema.mailMessages.threadId,
        inReplyTo: schema.mailMessages.inReplyTo,
        referencesHeader: schema.mailMessages.referencesHeader,
        fromAddress: schema.mailMessages.fromAddress,
        toAddresses: schema.mailMessages.toAddresses,
        ccAddresses: schema.mailMessages.ccAddresses,
        bccAddresses: schema.mailMessages.bccAddresses,
        subject: schema.mailMessages.subject,
        snippet: schema.mailMessages.snippet,
        isRead: schema.mailMessages.isRead,
        isStarred: schema.mailMessages.isStarred,
        isDraft: schema.mailMessages.isDraft,
        hasAttachments: schema.mailMessages.hasAttachments,
        sentAt: schema.mailMessages.sentAt,
        receivedAt: schema.mailMessages.receivedAt,
        uid: schema.mailMessages.uid,
        createdAt: schema.mailMessages.createdAt,
        updatedAt: schema.mailMessages.updatedAt,
    }

    const mailMessageDb = {
        list: async (params: {
            accountId?: number
            folderId?: number
            isRead?: boolean
            isStarred?: boolean
            userId: string
            page: number
            limit: number
        }) => {
            const offset = (params.page - 1) * params.limit

            let accountIds: number[]
            if (params.accountId) {
                const [owned] = await db
                    .select({ id: schema.mailAccounts.id })
                    .from(schema.mailAccounts)
                    .where(and(eq(schema.mailAccounts.id, params.accountId), eq(schema.mailAccounts.userId, params.userId)))
                    .limit(1)
                if (!owned) return { data: [], total: 0 }
                accountIds = [params.accountId]
            } else {
                const userAccounts = await db
                    .select({ id: schema.mailAccounts.id })
                    .from(schema.mailAccounts)
                    .where(eq(schema.mailAccounts.userId, params.userId))
                accountIds = userAccounts.map((a) => a.id)
                if (accountIds.length === 0) return { data: [], total: 0 }
            }

            const conditions = [inArray(schema.mailMessages.accountId, accountIds)]
            if (params.folderId) conditions.push(eq(schema.mailMessages.folderId, params.folderId))
            if (params.isRead !== undefined) conditions.push(eq(schema.mailMessages.isRead, params.isRead))
            if (params.isStarred !== undefined) conditions.push(eq(schema.mailMessages.isStarred, params.isStarred))

            const whereClause = and(...conditions)

            const [data, [{ count }]] = await Promise.all([
                db
                    .select(mailMessageListColumns)
                    .from(schema.mailMessages)
                    .where(whereClause)
                    .orderBy(desc(schema.mailMessages.receivedAt))
                    .limit(params.limit)
                    .offset(offset),
                db
                    .select({ count: sql<number>`COUNT(*)` })
                    .from(schema.mailMessages)
                    .where(whereClause),
            ])

            return { data, total: count }
        },
        getById: async (id: number) => {
            const [msg] = await db.select().from(schema.mailMessages).where(eq(schema.mailMessages.id, id)).limit(1)
            if (!msg) return null
            const attachments = await db.select().from(schema.mailAttachments).where(eq(schema.mailAttachments.messageId, id))
            return { ...msg, attachments }
        },
        getThread: async (accountId: number, threadId: string) => {
            return db
                .select(mailMessageListColumns)
                .from(schema.mailMessages)
                .where(and(eq(schema.mailMessages.accountId, accountId), eq(schema.mailMessages.threadId, threadId)))
                .orderBy(schema.mailMessages.sentAt)
        },
        search: async (params: {
            q?: string
            accountId?: number
            folderId?: number
            fromAddress?: string
            toAddress?: string
            hasAttachment?: boolean
            isRead?: boolean
            isStarred?: boolean
            dateFrom?: Date
            dateTo?: Date
            excludeJunk?: boolean
            userId: string
            page: number
            limit: number
        }) => {
            const offset = (params.page - 1) * params.limit

            let accountIds: number[]
            if (params.accountId) {
                const [owned] = await db
                    .select({ id: schema.mailAccounts.id })
                    .from(schema.mailAccounts)
                    .where(and(eq(schema.mailAccounts.id, params.accountId), eq(schema.mailAccounts.userId, params.userId)))
                    .limit(1)
                if (!owned) return { data: [], total: 0 }
                accountIds = [params.accountId]
            } else {
                const userAccounts = await db
                    .select({ id: schema.mailAccounts.id })
                    .from(schema.mailAccounts)
                    .where(eq(schema.mailAccounts.userId, params.userId))
                accountIds = userAccounts.map((a) => a.id)
                if (accountIds.length === 0) return { data: [], total: 0 }
            }

            const useFulltext = !!params.q && (await isFulltextIndexReady())
            const matchExpr =
                params.q && useFulltext
                    ? sql`MATCH(${schema.mailMessages.subject}, ${schema.mailMessages.bodyText}) AGAINST(${params.q} IN NATURAL LANGUAGE MODE)`
                    : null

            const conditions = [inArray(schema.mailMessages.accountId, accountIds)]

            if (params.q) {
                if (matchExpr) {
                    conditions.push(matchExpr)
                } else {
                    const escaped = escapeLikePattern(params.q)
                    conditions.push(
                        sql`(${schema.mailMessages.subject} LIKE ${`%${escaped}%`} ESCAPE '\\\\' OR ${schema.mailMessages.bodyText} LIKE ${`%${escaped}%`} ESCAPE '\\\\' OR ${schema.mailMessages.snippet} LIKE ${`%${escaped}%`} ESCAPE '\\\\')`,
                    )
                }
            }

            if (params.fromAddress) {
                const pattern = `%${escapeLikePattern(params.fromAddress)}%`
                conditions.push(
                    sql`(${schema.mailMessages.fromAddress}->>'$.address' LIKE ${pattern} ESCAPE '\\\\' OR ${schema.mailMessages.fromAddress}->>'$.name' LIKE ${pattern} ESCAPE '\\\\')`,
                )
            }

            if (params.toAddress) {
                const pattern = `%${escapeLikePattern(params.toAddress)}%`
                conditions.push(
                    sql`(JSON_SEARCH(${schema.mailMessages.toAddresses}, 'one', ${pattern}, NULL, '$[*].address') IS NOT NULL OR JSON_SEARCH(${schema.mailMessages.toAddresses}, 'one', ${pattern}, NULL, '$[*].name') IS NOT NULL)`,
                )
            }

            if (params.hasAttachment !== undefined) conditions.push(eq(schema.mailMessages.hasAttachments, params.hasAttachment))
            if (params.isRead !== undefined) conditions.push(eq(schema.mailMessages.isRead, params.isRead))
            if (params.isStarred !== undefined) conditions.push(eq(schema.mailMessages.isStarred, params.isStarred))
            if (params.dateFrom) conditions.push(gte(schema.mailMessages.receivedAt, params.dateFrom))
            if (params.dateTo) conditions.push(lte(schema.mailMessages.receivedAt, params.dateTo))
            if (params.folderId) conditions.push(eq(schema.mailMessages.folderId, params.folderId))
            if (params.excludeJunk) {
                conditions.push(
                    sql`${schema.mailMessages.folderId} NOT IN (SELECT ${schema.mailFolders.id} FROM ${schema.mailFolders} WHERE ${schema.mailFolders.type} IN ('trash', 'spam'))`,
                )
            }

            const whereClause = and(...conditions)
            const orderBy = matchExpr ? [desc(matchExpr), desc(schema.mailMessages.receivedAt)] : [desc(schema.mailMessages.receivedAt)]

            const [data, [{ count }]] = await Promise.all([
                db
                    .select(mailMessageListColumns)
                    .from(schema.mailMessages)
                    .where(whereClause)
                    .orderBy(...orderBy)
                    .limit(params.limit)
                    .offset(offset),
                db
                    .select({ count: sql<number>`COUNT(*)` })
                    .from(schema.mailMessages)
                    .where(whereClause),
            ])

            return { data, total: count }
        },
        updateFlags: async (messageIds: number[], flags: Record<string, unknown>) => {
            await db
                .update(schema.mailMessages)
                .set(flags as never)
                .where(inArray(schema.mailMessages.id, messageIds))
        },
        moveMessages: async (items: { messageId: number; remoteMessageId?: string; uid?: number | null }[], targetFolderId: number) => {
            if (items.length === 0) return

            await db.transaction(async (tx) => {
                for (const item of items) {
                    if (item.remoteMessageId) {
                        await tx
                            .delete(schema.mailMessages)
                            .where(
                                and(
                                    eq(schema.mailMessages.folderId, targetFolderId),
                                    eq(schema.mailMessages.remoteMessageId, item.remoteMessageId),
                                    ne(schema.mailMessages.id, item.messageId),
                                ),
                            )
                        await tx
                            .update(schema.mailMessages)
                            .set({ folderId: targetFolderId, remoteMessageId: item.remoteMessageId, uid: item.uid ?? null })
                            .where(eq(schema.mailMessages.id, item.messageId))
                        continue
                    }

                    const [current] = await tx
                        .select({ remoteMessageId: schema.mailMessages.remoteMessageId })
                        .from(schema.mailMessages)
                        .where(eq(schema.mailMessages.id, item.messageId))
                        .limit(1)
                    if (!current) continue

                    const [conflict] = await tx
                        .select({ id: schema.mailMessages.id })
                        .from(schema.mailMessages)
                        .where(
                            and(
                                eq(schema.mailMessages.folderId, targetFolderId),
                                eq(schema.mailMessages.remoteMessageId, current.remoteMessageId),
                                ne(schema.mailMessages.id, item.messageId),
                            ),
                        )
                        .limit(1)
                    if (conflict) {
                        await tx.delete(schema.mailMessages).where(eq(schema.mailMessages.id, item.messageId))
                        continue
                    }

                    await tx.update(schema.mailMessages).set({ folderId: targetFolderId }).where(eq(schema.mailMessages.id, item.messageId))
                }
            })
        },
        deleteMessages: async (messageIds: number[]) => {
            if (messageIds.length === 0) return
            const cachedAttachments = await db
                .select({ r2Key: schema.mailAttachments.r2Key })
                .from(schema.mailAttachments)
                .where(and(inArray(schema.mailAttachments.messageId, messageIds), isNotNull(schema.mailAttachments.r2Key)))
            for (const attachment of cachedAttachments) {
                if (!attachment.r2Key) continue
                await storageService.del(attachment.r2Key).catch(captureException)
            }
            await db.delete(schema.mailMessages).where(inArray(schema.mailMessages.id, messageIds))
        },
        getByIds: async (ids: number[]) => {
            if (ids.length === 0) return []
            return db.select().from(schema.mailMessages).where(inArray(schema.mailMessages.id, ids))
        },
        getAttachment: async (attachmentId: number) => {
            const [att] = await db.select().from(schema.mailAttachments).where(eq(schema.mailAttachments.id, attachmentId)).limit(1)
            return att ?? null
        },
        updateAttachmentR2Key: async (attachmentId: number, r2Key: string) => {
            await db.update(schema.mailAttachments).set({ r2Key }).where(eq(schema.mailAttachments.id, attachmentId))
        },
        getAccountIdsByMessageIds: async (messageIds: number[], userId: string) => {
            const msgs = await db
                .select({
                    messageId: schema.mailMessages.id,
                    accountId: schema.mailMessages.accountId,
                    remoteMessageId: schema.mailMessages.remoteMessageId,
                    folderId: schema.mailMessages.folderId,
                })
                .from(schema.mailMessages)
                .innerJoin(schema.mailAccounts, eq(schema.mailMessages.accountId, schema.mailAccounts.id))
                .where(and(inArray(schema.mailMessages.id, messageIds), eq(schema.mailAccounts.userId, userId)))
            return msgs
        },
        getUnreadMessages: async (params: { userId: string; accountId?: number; folderId?: number }) => {
            const conditions = [eq(schema.mailMessages.isRead, false), eq(schema.mailAccounts.userId, params.userId)]
            if (params.folderId) conditions.push(eq(schema.mailMessages.folderId, params.folderId))
            else if (params.accountId) conditions.push(eq(schema.mailMessages.accountId, params.accountId))
            return db
                .select({
                    id: schema.mailMessages.id,
                    remoteMessageId: schema.mailMessages.remoteMessageId,
                    folderId: schema.mailMessages.folderId,
                })
                .from(schema.mailMessages)
                .innerJoin(schema.mailAccounts, eq(schema.mailMessages.accountId, schema.mailAccounts.id))
                .where(and(...conditions))
        },
        getSenderList: async (params: { userId: string; accountId?: number; limit: number }) => {
            let accountIds: number[]
            if (params.accountId) {
                const [owned] = await db
                    .select({ id: schema.mailAccounts.id })
                    .from(schema.mailAccounts)
                    .where(and(eq(schema.mailAccounts.id, params.accountId), eq(schema.mailAccounts.userId, params.userId)))
                    .limit(1)
                if (!owned) return []
                accountIds = [params.accountId]
            } else {
                const userAccounts = await db
                    .select({ id: schema.mailAccounts.id })
                    .from(schema.mailAccounts)
                    .where(eq(schema.mailAccounts.userId, params.userId))
                accountIds = userAccounts.map((a) => a.id)
                if (accountIds.length === 0) return []
            }

            const rows = await db
                .select({ fromAddress: schema.mailMessages.fromAddress })
                .from(schema.mailMessages)
                .where(inArray(schema.mailMessages.accountId, accountIds))
                .orderBy(desc(schema.mailMessages.receivedAt))
                .limit(params.limit)

            const senderMap = new Map<string, string>()
            for (const row of rows) {
                const addr = row.fromAddress as { address?: string; name?: string } | null
                if (!addr?.address) continue
                if (!senderMap.has(addr.address)) {
                    senderMap.set(addr.address, addr.name ?? '')
                }
            }
            return [...senderMap.entries()].map(([address, name]) => ({ address, name }))
        },
        countMessagesByFolder: mailSyncDb.countMessagesByFolder,
        countUnreadByFolder: mailSyncDb.countUnreadByFolder,
        updateFolderCounts: mailSyncDb.updateFolderCounts,
        getFolderById: mailSyncDb.getFolderById,
    }

    const mailUploadDb = {
        insert: async (data: { userId: string; filename: string; mimeType: string; sizeBytes: number; r2Key: string; isInline: boolean }) => {
            const [result] = await db.insert(schema.mailUploads).values(data).$returningId()
            return { id: result.id }
        },
        getById: async (id: number) => {
            const [row] = await db.select().from(schema.mailUploads).where(eq(schema.mailUploads.id, id)).limit(1)
            return row ?? null
        },
        getByIds: async (ids: number[]) => {
            if (ids.length === 0) return []
            return db.select().from(schema.mailUploads).where(inArray(schema.mailUploads.id, ids))
        },
        deleteById: async (id: number) => {
            await db.delete(schema.mailUploads).where(eq(schema.mailUploads.id, id))
        },
    }

    const mailStorageAdapter = {
        upload: async (key: string, body: Buffer, contentType: string) => {
            await storageService.upload(key, body, contentType)
        },
        delete: async (key: string) => {
            await storageService.del(key)
        },
        getUrl: storageService.getUrl,
        // S3 SDK로 버킷에서 직접 가져온다. CDN public URL fetch는 버킷이 private이면 실패하므로 사용하지 않는다.
        download: async (key: string) => {
            return storageService.getObject(key)
        },
    }

    const mailUploadService = createMailUploadService({
        storage: mailStorageAdapter,
        db: mailUploadDb,
        generateId: () => crypto.randomUUID(),
    })

    const mailMessageService = createMailMessageService({
        db: mailMessageDb,
        accountService: mailAccountService,
        uploadService: mailUploadService,
        storageService: {
            upload: mailStorageAdapter.upload,
            getUrl: mailStorageAdapter.getUrl,
            download: mailStorageAdapter.download,
        },
    })

    const mailDraftDb = {
        findDraftsFolder: async (accountId: number) => {
            const [folder] = await db
                .select()
                .from(schema.mailFolders)
                .where(and(eq(schema.mailFolders.accountId, accountId), eq(schema.mailFolders.type, 'drafts')))
                .orderBy(schema.mailFolders.id)
                .limit(1)
            return folder ?? null
        },
        createDraftsFolder: async (data: { accountId: number; remoteFolderId: string; name: string; type: string }) => {
            await db
                .insert(schema.mailFolders)
                .values({
                    accountId: data.accountId,
                    remoteFolderId: data.remoteFolderId,
                    name: data.name,
                    type: data.type,
                    parentId: null,
                    messageCount: 0,
                    unreadCount: 0,
                    uidValidity: null,
                })
                .onDuplicateKeyUpdate({ set: { name: data.name, type: data.type } })
            const [folder] = await db
                .select()
                .from(schema.mailFolders)
                .where(and(eq(schema.mailFolders.accountId, data.accountId), eq(schema.mailFolders.remoteFolderId, data.remoteFolderId)))
                .limit(1)
            return folder
        },
        insertDraft: async (data: {
            accountId: number
            folderId: number
            remoteMessageId: string
            fromAddress: { name: string; address: string } | null
            toAddresses: { name: string; address: string }[]
            ccAddresses: { name: string; address: string }[]
            bccAddresses: { name: string; address: string }[]
            subject: string | null
            bodyHtml: string | null
            bodyText: string | null
            snippet: string | null
            threadId: string | null
            inReplyTo: string | null
            referencesHeader: string | null
            isRead: boolean
            isStarred: boolean
            isDraft: boolean
            hasAttachments: boolean
            sentAt: Date | null
            receivedAt: Date | null
        }) => {
            const [result] = await db.insert(schema.mailMessages).values(data).$returningId()
            return { id: result.id }
        },
        getMessageById: async (id: number) => {
            const [msg] = await db.select().from(schema.mailMessages).where(eq(schema.mailMessages.id, id)).limit(1)
            return msg ?? null
        },
        updateDraft: async (
            id: number,
            data: Partial<
                Pick<
                    schema.MailMessage,
                    | 'toAddresses'
                    | 'ccAddresses'
                    | 'bccAddresses'
                    | 'subject'
                    | 'bodyHtml'
                    | 'bodyText'
                    | 'snippet'
                    | 'inReplyTo'
                    | 'referencesHeader'
                >
            >,
        ) => {
            await db.update(schema.mailMessages).set(data).where(eq(schema.mailMessages.id, id))
        },
        deleteById: async (id: number) => {
            await db.delete(schema.mailMessages).where(eq(schema.mailMessages.id, id))
        },
        countMessagesByFolder: mailSyncDb.countMessagesByFolder,
        countUnreadByFolder: mailSyncDb.countUnreadByFolder,
        updateFolderCounts: mailSyncDb.updateFolderCounts,
    }

    const mailDraftService = createMailDraftService({
        db: mailDraftDb,
        accountService: mailAccountService,
        generateId: () => crypto.randomUUID(),
    })

    const mailFolderDb = {
        getFoldersByAccount: mailSyncDb.getFoldersByAccount,
    }

    const mailRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 20 }, rateLimitStore)
    const mailCheckLimit = (key: string, path: string) => mailRateLimiter.checkLimit(`mail:${key}:${path}`)

    return {
        mailAccountService,
        mailOAuthConnect,
        mailSyncService,
        mailMessageService,
        mailDraftService,
        mailUploadService,
        mailFolderDb,
        mailMessageDb,
        mailSyncDb,
        mailCheckLimit,
    }
}
