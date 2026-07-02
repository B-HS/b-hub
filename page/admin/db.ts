import { and, desc, eq, gte, isNotNull, isNull, like, lte, or, sql } from 'drizzle-orm'
import type { Database } from '../../db'
import * as s from '../../db/schema'

export type AdminDb = ReturnType<typeof createAdminDb>

export const createAdminDb = (db: Database) => ({
    // ── Dashboard counters ────────────────────────────────────────────
    counts: async () => {
        const [u] = await db.select({ c: sql<number>`count(*)` }).from(s.user)
        const [posts] = await db.select({ c: sql<number>`count(*)` }).from(s.posts)
        const [comments] = await db.select({ c: sql<number>`count(*)` }).from(s.comments)
        const [msgs] = await db.select({ c: sql<number>`count(*)` }).from(s.messages)
        const [mailAcc] = await db.select({ c: sql<number>`count(*)` }).from(s.mailAccounts)
        const [spotifyAcc] = await db.select({ c: sql<number>`count(*)` }).from(s.spotifyAccounts)
        const [resumes] = await db.select({ c: sql<number>`count(*)` }).from(s.resumes)
        const [events] = await db.select({ c: sql<number>`count(*)` }).from(s.calendarEvent)
        const [drive] = await db.select({ c: sql<number>`count(*)` }).from(s.cloudAssets)
        const [tokens] = await db.select({ c: sql<number>`count(*)` }).from(s.apiToken)
        const [sessions] = await db.select({ c: sql<number>`count(*)` }).from(s.session)
        const [requests24h] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.apiRequestLog)
            .where(sql`created_at > date_sub(now(), interval 1 day)`)
        const [errors24h] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.apiRequestLog)
            .where(sql`status_code >= 400 and created_at > date_sub(now(), interval 1 day)`)
        const [storageBytes] = await db.select({ b: sql<number>`coalesce(sum(size_bytes), 0)` }).from(s.cloudAssets)
        const [weatherLogs] = await db.select({ c: sql<number>`count(*)` }).from(s.weatherApiLog)
        const [logEvents24h] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.logEvents)
            .where(sql`created_at > date_sub(now(), interval 1 day)`)
        const [logErrors24h] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.logEvents)
            .where(sql`severity >= 40 and created_at > date_sub(now(), interval 1 day)`)
        return {
            users: Number(u?.c ?? 0),
            posts: Number(posts?.c ?? 0),
            comments: Number(comments?.c ?? 0),
            messages: Number(msgs?.c ?? 0),
            mailAccounts: Number(mailAcc?.c ?? 0),
            spotifyAccounts: Number(spotifyAcc?.c ?? 0),
            resumes: Number(resumes?.c ?? 0),
            calendarEvents: Number(events?.c ?? 0),
            driveAssets: Number(drive?.c ?? 0),
            apiTokens: Number(tokens?.c ?? 0),
            activeSessions: Number(sessions?.c ?? 0),
            requests24h: Number(requests24h?.c ?? 0),
            errors24h: Number(errors24h?.c ?? 0),
            weatherLogs: Number(weatherLogs?.c ?? 0),
            logEvents24h: Number(logEvents24h?.c ?? 0),
            logErrors24h: Number(logErrors24h?.c ?? 0),
            storageBytes: Number(storageBytes?.b ?? 0),
        }
    },

    recentErrors: async (limit = 5) =>
        db
            .select({
                id: s.apiRequestLog.id,
                method: s.apiRequestLog.method,
                path: s.apiRequestLog.path,
                statusCode: s.apiRequestLog.statusCode,
                userId: s.apiRequestLog.userId,
                durationMs: s.apiRequestLog.durationMs,
                createdAt: s.apiRequestLog.createdAt,
                errorCode: s.apiRequestLog.errorCode,
            })
            .from(s.apiRequestLog)
            .where(isNotNull(s.apiRequestLog.errorCode))
            .orderBy(desc(s.apiRequestLog.createdAt))
            .limit(limit),

    recentUsers: async (limit = 5) =>
        db
            .select({ id: s.user.id, email: s.user.email, name: s.user.name, role: s.user.role, createdAt: s.user.createdAt })
            .from(s.user)
            .orderBy(desc(s.user.createdAt))
            .limit(limit),

    recentRequests: async (limit = 10) =>
        db
            .select({
                id: s.apiRequestLog.id,
                method: s.apiRequestLog.method,
                path: s.apiRequestLog.path,
                statusCode: s.apiRequestLog.statusCode,
                userId: s.apiRequestLog.userId,
                durationMs: s.apiRequestLog.durationMs,
                createdAt: s.apiRequestLog.createdAt,
                errorCode: s.apiRequestLog.errorCode,
            })
            .from(s.apiRequestLog)
            .orderBy(desc(s.apiRequestLog.createdAt))
            .limit(limit),

    // ── Users ─────────────────────────────────────────────────────────
    listUsers: async (params: { page: number; size: number; q?: string; role?: string; banned?: 'y' | 'n' }) => {
        const offset = (params.page - 1) * params.size
        const conds = []
        if (params.q) conds.push(or(like(s.user.email, `%${params.q}%`), like(s.user.name, `%${params.q}%`)))
        if (params.role === 'admin') conds.push(eq(s.user.role, 'admin'))
        if (params.role === 'user') conds.push(or(eq(s.user.role, 'user'), sql`${s.user.role} is null`))
        if (params.banned === 'y') conds.push(eq(s.user.banned, true))
        if (params.banned === 'n') conds.push(or(eq(s.user.banned, false), sql`${s.user.banned} is null`))
        const where = conds.length ? and(...conds) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.user)
            .where(where)
        const rows = await db
            .select({
                id: s.user.id,
                email: s.user.email,
                name: s.user.name,
                role: s.user.role,
                banned: s.user.banned,
                createdAt: s.user.createdAt,
                timezone: s.user.timezone,
                storageQuotaBytes: s.user.storageQuotaBytes,
            })
            .from(s.user)
            .where(where)
            .orderBy(desc(s.user.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    getUser: async (id: string) => {
        const [row] = await db.select().from(s.user).where(eq(s.user.id, id)).limit(1)
        return row ?? null
    },

    getUserAccounts: async (userId: string) =>
        db
            .select({ id: s.account.id, providerId: s.account.providerId, accountId: s.account.accountId, createdAt: s.account.createdAt })
            .from(s.account)
            .where(eq(s.account.userId, userId)),

    getUserSessions: async (userId: string) =>
        db
            .select({
                id: s.session.id,
                ipAddress: s.session.ipAddress,
                userAgent: s.session.userAgent,
                createdAt: s.session.createdAt,
                expiresAt: s.session.expiresAt,
            })
            .from(s.session)
            .where(eq(s.session.userId, userId))
            .orderBy(desc(s.session.createdAt)),

    getUserApiRequests: async (userId: string, limit = 20) =>
        db
            .select({
                id: s.apiRequestLog.id,
                method: s.apiRequestLog.method,
                path: s.apiRequestLog.path,
                statusCode: s.apiRequestLog.statusCode,
                durationMs: s.apiRequestLog.durationMs,
                errorCode: s.apiRequestLog.errorCode,
                createdAt: s.apiRequestLog.createdAt,
            })
            .from(s.apiRequestLog)
            .where(eq(s.apiRequestLog.userId, userId))
            .orderBy(desc(s.apiRequestLog.createdAt))
            .limit(limit),

    updateUserRole: async (id: string, role: 'admin' | 'user') => {
        await db.update(s.user).set({ role }).where(eq(s.user.id, id))
    },

    updateUserBan: async (id: string, banned: boolean, banReason: string | null, banExpires: Date | null) => {
        await db.update(s.user).set({ banned, banReason, banExpires }).where(eq(s.user.id, id))
    },

    updateUserQuota: async (id: string, bytes: number) => {
        await db.update(s.user).set({ storageQuotaBytes: bytes }).where(eq(s.user.id, id))
    },

    revokeSession: async (sessionId: string) => {
        await db.delete(s.session).where(eq(s.session.id, sessionId))
    },

    revokeAllUserSessions: async (userId: string) => {
        await db.delete(s.session).where(eq(s.session.userId, userId))
    },

    // ── Sessions ──────────────────────────────────────────────────────
    listSessions: async (params: { page: number; size: number; q?: string }) => {
        const offset = (params.page - 1) * params.size
        const where = params.q ? like(s.user.email, `%${params.q}%`) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.session)
            .innerJoin(s.user, eq(s.user.id, s.session.userId))
            .where(where)
        const rows = await db
            .select({
                id: s.session.id,
                userId: s.session.userId,
                userEmail: s.user.email,
                ipAddress: s.session.ipAddress,
                userAgent: s.session.userAgent,
                createdAt: s.session.createdAt,
                expiresAt: s.session.expiresAt,
            })
            .from(s.session)
            .innerJoin(s.user, eq(s.user.id, s.session.userId))
            .where(where)
            .orderBy(desc(s.session.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    // ── API Tokens / Logs ─────────────────────────────────────────────
    listApiTokens: async (params: { page: number; size: number; q?: string }) => {
        const offset = (params.page - 1) * params.size
        const where = params.q ? or(like(s.user.email, `%${params.q}%`), like(s.apiToken.name, `%${params.q}%`)) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.apiToken)
            .innerJoin(s.user, eq(s.user.id, s.apiToken.userId))
            .where(where)
        const rows = await db
            .select({
                id: s.apiToken.id,
                token: s.apiToken.token,
                name: s.apiToken.name,
                userId: s.apiToken.userId,
                userEmail: s.user.email,
                expiresAt: s.apiToken.expiresAt,
                lastUsedAt: s.apiToken.lastUsedAt,
                createdAt: s.apiToken.createdAt,
            })
            .from(s.apiToken)
            .innerJoin(s.user, eq(s.user.id, s.apiToken.userId))
            .where(where)
            .orderBy(desc(s.apiToken.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    revokeApiToken: async (id: number) => {
        await db.delete(s.apiToken).where(eq(s.apiToken.id, id))
    },

    listApiLogs: async (params: { page: number; size: number; status?: number; path?: string; userId?: string; from?: Date; to?: Date }) => {
        const offset = (params.page - 1) * params.size
        const conds = []
        if (params.status) conds.push(eq(s.apiRequestLog.statusCode, params.status))
        if (params.path) conds.push(like(s.apiRequestLog.path, `%${params.path}%`))
        if (params.userId) conds.push(eq(s.apiRequestLog.userId, params.userId))
        if (params.from) conds.push(gte(s.apiRequestLog.createdAt, params.from))
        if (params.to) conds.push(lte(s.apiRequestLog.createdAt, params.to))
        const where = conds.length ? and(...conds) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.apiRequestLog)
            .where(where)
        const rows = await db.select().from(s.apiRequestLog).where(where).orderBy(desc(s.apiRequestLog.createdAt)).limit(params.size).offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    // ── Log Events ────────────────────────────────────────────────────
    listLogEvents: async (params: {
        page: number
        size: number
        service?: string
        severityGte?: number
        deviceId?: string
        errorCode?: string
        unresolved?: 'y' | 'n'
        from?: Date
        to?: Date
    }) => {
        const offset = (params.page - 1) * params.size
        const conds = []
        if (params.service) conds.push(eq(s.logEvents.service, params.service))
        if (params.severityGte != null) conds.push(gte(s.logEvents.severity, params.severityGte))
        if (params.deviceId) conds.push(eq(s.logEvents.deviceId, params.deviceId))
        if (params.errorCode) conds.push(like(s.logEvents.errorCode, `%${params.errorCode}%`))
        if (params.unresolved === 'y') conds.push(isNull(s.logEvents.resolvedAt))
        if (params.unresolved === 'n') conds.push(isNotNull(s.logEvents.resolvedAt))
        if (params.from) conds.push(gte(s.logEvents.createdAt, params.from))
        if (params.to) conds.push(lte(s.logEvents.createdAt, params.to))
        const where = conds.length ? and(...conds) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.logEvents)
            .where(where)
        const rows = await db.select().from(s.logEvents).where(where).orderBy(desc(s.logEvents.createdAt)).limit(params.size).offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    resolveLogEvent: async (id: number) => {
        await db.update(s.logEvents).set({ resolvedAt: new Date() }).where(eq(s.logEvents.id, id))
    },

    recentLogEvents: async (limit = 5) =>
        db
            .select({
                id: s.logEvents.id,
                service: s.logEvents.service,
                errorCode: s.logEvents.errorCode,
                severity: s.logEvents.severity,
                deviceId: s.logEvents.deviceId,
                resolvedAt: s.logEvents.resolvedAt,
                createdAt: s.logEvents.createdAt,
            })
            .from(s.logEvents)
            .where(gte(s.logEvents.severity, 40))
            .orderBy(desc(s.logEvents.createdAt))
            .limit(limit),

    // ── Blog: Posts ───────────────────────────────────────────────────
    listPosts: async (params: {
        page: number
        size: number
        q?: string
        categoryId?: number
        tagId?: number
        published?: 'y' | 'n'
        hidden?: 'y' | 'n'
        notice?: 'y' | 'n'
    }) => {
        const offset = (params.page - 1) * params.size
        const conds = []
        if (params.q) conds.push(or(like(s.posts.title, `%${params.q}%`), like(s.posts.description, `%${params.q}%`)))
        if (params.categoryId) conds.push(eq(s.posts.categoryId, params.categoryId))
        if (params.tagId)
            conds.push(
                sql`exists (select 1 from ${s.postTags} where ${s.postTags.postId} = ${s.posts.postId} and ${s.postTags.tagId} = ${params.tagId})`,
            )
        if (params.published === 'y') conds.push(eq(s.posts.isPublished, true))
        if (params.published === 'n') conds.push(eq(s.posts.isPublished, false))
        if (params.hidden === 'y') conds.push(eq(s.posts.isHide, true))
        if (params.hidden === 'n') conds.push(eq(s.posts.isHide, false))
        if (params.notice === 'y') conds.push(eq(s.posts.isNotice, true))
        if (params.notice === 'n') conds.push(eq(s.posts.isNotice, false))
        const where = conds.length ? and(...conds) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.posts)
            .where(where)
        const rows = await db
            .select({
                postId: s.posts.postId,
                title: s.posts.title,
                categoryId: s.posts.categoryId,
                categoryName: s.categories.category,
                createdAt: s.posts.createdAt,
                updatedAt: s.posts.updatedAt,
                views: s.posts.views,
                isPublished: s.posts.isPublished,
                isHide: s.posts.isHide,
                isNotice: s.posts.isNotice,
                isComment: s.posts.isComment,
            })
            .from(s.posts)
            .leftJoin(s.categories, eq(s.categories.categoryId, s.posts.categoryId))
            .where(where)
            .orderBy(desc(s.posts.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    togglePostFlag: async (postId: number, flag: 'isPublished' | 'isHide' | 'isNotice' | 'isComment') => {
        const [row] = await db.select().from(s.posts).where(eq(s.posts.postId, postId)).limit(1)
        if (!row) return
        const value = !row[flag]
        await db
            .update(s.posts)
            .set({ [flag]: value, updatedAt: new Date() })
            .where(eq(s.posts.postId, postId))
    },

    deletePost: async (postId: number) => {
        await db.delete(s.postTags).where(eq(s.postTags.postId, postId))
        await db.delete(s.comments).where(eq(s.comments.postId, postId))
        await db.delete(s.posts).where(eq(s.posts.postId, postId))
    },

    // ── Blog: Comments ────────────────────────────────────────────────
    listComments: async (params: { page: number; size: number; q?: string; postId?: number; userId?: string; hidden?: 'y' | 'n' }) => {
        const offset = (params.page - 1) * params.size
        const conds = []
        if (params.q) conds.push(like(s.comments.comment, `%${params.q}%`))
        if (params.postId) conds.push(eq(s.comments.postId, params.postId))
        if (params.userId) conds.push(eq(s.comments.userId, params.userId))
        if (params.hidden === 'y') conds.push(eq(s.comments.isHide, true))
        if (params.hidden === 'n') conds.push(eq(s.comments.isHide, false))
        const where = conds.length ? and(...conds) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.comments)
            .where(where)
        const rows = await db
            .select({
                commentId: s.comments.commentId,
                postId: s.comments.postId,
                postTitle: s.posts.title,
                userId: s.comments.userId,
                userEmail: s.user.email,
                comment: s.comments.comment,
                createdAt: s.comments.createdAt,
                isHide: s.comments.isHide,
            })
            .from(s.comments)
            .leftJoin(s.posts, eq(s.posts.postId, s.comments.postId))
            .leftJoin(s.user, eq(s.user.id, s.comments.userId))
            .where(where)
            .orderBy(desc(s.comments.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    toggleCommentHide: async (id: number) => {
        const [row] = await db.select().from(s.comments).where(eq(s.comments.commentId, id)).limit(1)
        if (!row) return
        await db.update(s.comments).set({ isHide: !row.isHide, updatedAt: new Date() }).where(eq(s.comments.commentId, id))
    },

    deleteComment: async (id: number) => {
        await db.delete(s.comments).where(eq(s.comments.commentId, id))
    },

    // ── Blog: Categories / Tags ───────────────────────────────────────
    listCategories: async () => db.select().from(s.categories).orderBy(s.categories.categoryId),

    insertCategory: async (name: string) => {
        await db.insert(s.categories).values({ category: name })
    },

    toggleCategoryHide: async (id: number) => {
        const [row] = await db.select().from(s.categories).where(eq(s.categories.categoryId, id)).limit(1)
        if (!row) return
        await db.update(s.categories).set({ isHide: !row.isHide }).where(eq(s.categories.categoryId, id))
    },

    listTags: async () => db.select().from(s.tags).orderBy(s.tags.tag),

    insertTag: async (tag: string) => {
        await db.insert(s.tags).values({ tag })
    },

    deleteTag: async (id: number) => {
        await db.delete(s.postTags).where(eq(s.postTags.tagId, id))
        await db.delete(s.tags).where(eq(s.tags.tagId, id))
    },

    // ── Blog: Images ──────────────────────────────────────────────────
    listImageAssets: async (params: { page: number; size: number; q?: string }) => {
        const offset = (params.page - 1) * params.size
        const where = params.q ? like(s.imageAssets.r2Key, `%${params.q}%`) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.imageAssets)
            .where(where)
        const rows = await db
            .select({
                id: s.imageAssets.id,
                r2Key: s.imageAssets.r2Key,
                bucket: s.imageAssets.bucket,
                mimeType: s.imageAssets.mimeType,
                sizeBytes: s.imageAssets.sizeBytes,
                width: s.imageAssets.width,
                height: s.imageAssets.height,
                uploadedBy: s.imageAssets.uploadedBy,
                uploadedByEmail: s.user.email,
                createdAt: s.imageAssets.createdAt,
            })
            .from(s.imageAssets)
            .leftJoin(s.user, eq(s.user.id, s.imageAssets.uploadedBy))
            .where(where)
            .orderBy(desc(s.imageAssets.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    deleteImageAsset: async (id: string) => {
        await db.delete(s.imageAssets).where(eq(s.imageAssets.id, id))
    },

    // ── Messages (social feed) ────────────────────────────────────────
    listMessages: async (params: { page: number; size: number; q?: string; userId?: string; includeDeleted?: 'y' | 'n' }) => {
        const offset = (params.page - 1) * params.size
        const conds = []
        if (params.q) conds.push(like(s.messages.body, `%${params.q}%`))
        if (params.userId) conds.push(eq(s.messages.userId, params.userId))
        if (params.includeDeleted !== 'y') conds.push(sql`${s.messages.deletedAt} is null`)
        const where = conds.length ? and(...conds) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.messages)
            .where(where)
        const rows = await db
            .select({
                id: s.messages.id,
                userId: s.messages.userId,
                userEmail: s.user.email,
                body: s.messages.body,
                replyToId: s.messages.replyToId,
                retweetOfId: s.messages.retweetOfId,
                createdAt: s.messages.createdAt,
                deletedAt: s.messages.deletedAt,
                likesCount: sql<number>`(select count(*) from ${s.messageLikes} where ${s.messageLikes.messageId} = ${s.messages.id})`,
                bookmarksCount: sql<number>`(select count(*) from ${s.messageBookmarks} where ${s.messageBookmarks.messageId} = ${s.messages.id})`,
            })
            .from(s.messages)
            .leftJoin(s.user, eq(s.user.id, s.messages.userId))
            .where(where)
            .orderBy(desc(s.messages.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    getMessage: async (id: string) => {
        const [row] = await db
            .select({
                id: s.messages.id,
                userId: s.messages.userId,
                userEmail: s.user.email,
                body: s.messages.body,
                replyToId: s.messages.replyToId,
                retweetOfId: s.messages.retweetOfId,
                createdAt: s.messages.createdAt,
                deletedAt: s.messages.deletedAt,
            })
            .from(s.messages)
            .leftJoin(s.user, eq(s.user.id, s.messages.userId))
            .where(eq(s.messages.id, id))
            .limit(1)
        return row ?? null
    },

    getMessageImages: async (messageId: string) =>
        db
            .select({
                imageId: s.messageImages.imageId,
                order: s.messageImages.order,
                r2Key: s.imageAssets.r2Key,
                mimeType: s.imageAssets.mimeType,
            })
            .from(s.messageImages)
            .leftJoin(s.imageAssets, eq(s.imageAssets.id, s.messageImages.imageId))
            .where(eq(s.messageImages.messageId, messageId))
            .orderBy(s.messageImages.order),

    getMessageLikes: async (messageId: string) =>
        db
            .select({ userId: s.messageLikes.userId, userEmail: s.user.email, createdAt: s.messageLikes.createdAt })
            .from(s.messageLikes)
            .leftJoin(s.user, eq(s.user.id, s.messageLikes.userId))
            .where(eq(s.messageLikes.messageId, messageId))
            .orderBy(desc(s.messageLikes.createdAt)),

    getMessageBookmarks: async (messageId: string) =>
        db
            .select({ userId: s.messageBookmarks.userId, userEmail: s.user.email, createdAt: s.messageBookmarks.createdAt })
            .from(s.messageBookmarks)
            .leftJoin(s.user, eq(s.user.id, s.messageBookmarks.userId))
            .where(eq(s.messageBookmarks.messageId, messageId))
            .orderBy(desc(s.messageBookmarks.createdAt)),

    softDeleteMessage: async (id: string) => {
        await db.update(s.messages).set({ deletedAt: new Date() }).where(eq(s.messages.id, id))
    },

    restoreMessage: async (id: string) => {
        await db.update(s.messages).set({ deletedAt: null }).where(eq(s.messages.id, id))
    },

    listFollows: async (params: { page: number; size: number }) => {
        const offset = (params.page - 1) * params.size
        const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(s.follows)
        const rows = await db.select().from(s.follows).orderBy(desc(s.follows.createdAt)).limit(params.size).offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    // ── Weather ───────────────────────────────────────────────────────
    listWeatherKeys: async (params: { page: number; size: number; q?: string }) => {
        const offset = (params.page - 1) * params.size
        const where = params.q ? or(like(s.user.email, `%${params.q}%`), like(s.weatherApiKey.name, `%${params.q}%`)) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.weatherApiKey)
            .innerJoin(s.user, eq(s.user.id, s.weatherApiKey.userId))
            .where(where)
        const rows = await db
            .select({
                id: s.weatherApiKey.id,
                userId: s.weatherApiKey.userId,
                userEmail: s.user.email,
                name: s.weatherApiKey.name,
                token: s.weatherApiKey.token,
                dailyLimit: s.weatherApiKey.dailyLimit,
                expiresAt: s.weatherApiKey.expiresAt,
                lastUsedAt: s.weatherApiKey.lastUsedAt,
                createdAt: s.weatherApiKey.createdAt,
            })
            .from(s.weatherApiKey)
            .innerJoin(s.user, eq(s.user.id, s.weatherApiKey.userId))
            .where(where)
            .orderBy(desc(s.weatherApiKey.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    revokeWeatherKey: async (id: number) => {
        await db.delete(s.weatherApiKey).where(eq(s.weatherApiKey.id, id))
    },

    listWeatherLogs: async (params: { page: number; size: number; status?: number; endpoint?: string; userId?: string; from?: Date; to?: Date }) => {
        const offset = (params.page - 1) * params.size
        const conds = []
        if (params.status) conds.push(eq(s.weatherApiLog.statusCode, params.status))
        if (params.endpoint) conds.push(like(s.weatherApiLog.endpoint, `%${params.endpoint}%`))
        if (params.userId) conds.push(eq(s.weatherApiLog.userId, params.userId))
        if (params.from) conds.push(gte(s.weatherApiLog.createdAt, params.from))
        if (params.to) conds.push(lte(s.weatherApiLog.createdAt, params.to))
        const where = conds.length ? and(...conds) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.weatherApiLog)
            .where(where)
        const rows = await db.select().from(s.weatherApiLog).where(where).orderBy(desc(s.weatherApiLog.createdAt)).limit(params.size).offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    weatherCacheSummary: async () => {
        const [current] = await db.select({ c: sql<number>`count(*)` }).from(s.weatherCurrent)
        const [ultra] = await db.select({ c: sql<number>`count(*)` }).from(s.weatherUltra)
        const [short] = await db.select({ c: sql<number>`count(*)` }).from(s.weatherShort)
        return {
            current: Number(current?.c ?? 0),
            ultra: Number(ultra?.c ?? 0),
            short: Number(short?.c ?? 0),
        }
    },

    weatherCacheGrids: async (limit = 50) =>
        db
            .select({
                nx: s.weatherCurrent.nx,
                ny: s.weatherCurrent.ny,
                lastBaseDate: sql<string>`max(base_date)`,
                lastBaseTime: sql<string>`max(base_time)`,
                rows: sql<number>`count(*)`,
            })
            .from(s.weatherCurrent)
            .groupBy(s.weatherCurrent.nx, s.weatherCurrent.ny)
            .orderBy(sql`max(created_at) desc`)
            .limit(limit),

    deleteWeatherCacheGrid: async (nx: number, ny: number) => {
        await db.delete(s.weatherCurrent).where(and(eq(s.weatherCurrent.nx, nx), eq(s.weatherCurrent.ny, ny)))
        await db.delete(s.weatherUltra).where(and(eq(s.weatherUltra.nx, nx), eq(s.weatherUltra.ny, ny)))
        await db.delete(s.weatherShort).where(and(eq(s.weatherShort.nx, nx), eq(s.weatherShort.ny, ny)))
    },

    // ── Mail ──────────────────────────────────────────────────────────
    listMailAccounts: async (params: { page: number; size: number; q?: string }) => {
        const offset = (params.page - 1) * params.size
        const where = params.q ? or(like(s.user.email, `%${params.q}%`), like(s.mailAccounts.email, `%${params.q}%`)) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.mailAccounts)
            .innerJoin(s.user, eq(s.user.id, s.mailAccounts.userId))
            .where(where)
        const rows = await db
            .select({
                id: s.mailAccounts.id,
                userId: s.mailAccounts.userId,
                userEmail: s.user.email,
                provider: s.mailAccounts.provider,
                email: s.mailAccounts.email,
                isActive: s.mailAccounts.isActive,
                lastSyncAt: s.mailAccounts.lastSyncAt,
                lastSyncStatus: s.mailAccounts.lastSyncStatus,
                createdAt: s.mailAccounts.createdAt,
            })
            .from(s.mailAccounts)
            .innerJoin(s.user, eq(s.user.id, s.mailAccounts.userId))
            .where(where)
            .orderBy(desc(s.mailAccounts.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    toggleMailAccount: async (id: number) => {
        const [row] = await db.select().from(s.mailAccounts).where(eq(s.mailAccounts.id, id)).limit(1)
        if (!row) return
        await db.update(s.mailAccounts).set({ isActive: !row.isActive }).where(eq(s.mailAccounts.id, id))
    },

    listMailSyncLogs: async (params: { page: number; size: number; accountId?: number; status?: string }) => {
        const offset = (params.page - 1) * params.size
        const conds = []
        if (params.accountId) conds.push(eq(s.mailSyncLogs.accountId, params.accountId))
        if (params.status) conds.push(eq(s.mailSyncLogs.status, params.status))
        const where = conds.length ? and(...conds) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.mailSyncLogs)
            .where(where)
        const rows = await db.select().from(s.mailSyncLogs).where(where).orderBy(desc(s.mailSyncLogs.createdAt)).limit(params.size).offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    listMailSyncSessions: async (params: { page: number; size: number; status?: string }) => {
        const offset = (params.page - 1) * params.size
        const where = params.status ? eq(s.mailSyncSessions.status, params.status) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.mailSyncSessions)
            .where(where)
        const rows = await db
            .select()
            .from(s.mailSyncSessions)
            .where(where)
            .orderBy(desc(s.mailSyncSessions.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    listMailMessages: async (params: {
        page: number
        size: number
        accountId?: number
        q?: string
        folderId?: number
        isRead?: 'y' | 'n'
        hasAttachments?: 'y' | 'n'
    }) => {
        const offset = (params.page - 1) * params.size
        const conds = []
        if (params.accountId) conds.push(eq(s.mailMessages.accountId, params.accountId))
        if (params.q) conds.push(like(s.mailMessages.subject, `%${params.q}%`))
        if (params.folderId) conds.push(eq(s.mailMessages.folderId, params.folderId))
        if (params.isRead === 'y') conds.push(eq(s.mailMessages.isRead, true))
        if (params.isRead === 'n') conds.push(eq(s.mailMessages.isRead, false))
        if (params.hasAttachments === 'y') conds.push(eq(s.mailMessages.hasAttachments, true))
        if (params.hasAttachments === 'n') conds.push(eq(s.mailMessages.hasAttachments, false))
        const where = conds.length ? and(...conds) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.mailMessages)
            .where(where)
        const rows = await db
            .select({
                id: s.mailMessages.id,
                accountId: s.mailMessages.accountId,
                folderId: s.mailMessages.folderId,
                subject: s.mailMessages.subject,
                fromAddress: s.mailMessages.fromAddress,
                isRead: s.mailMessages.isRead,
                hasAttachments: s.mailMessages.hasAttachments,
                receivedAt: s.mailMessages.receivedAt,
                sentAt: s.mailMessages.sentAt,
            })
            .from(s.mailMessages)
            .where(where)
            .orderBy(desc(s.mailMessages.receivedAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    listMailUploads: async (params: { page: number; size: number; q?: string }) => {
        const offset = (params.page - 1) * params.size
        const where = params.q ? like(s.mailUploads.filename, `%${params.q}%`) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.mailUploads)
            .where(where)
        const rows = await db
            .select({
                id: s.mailUploads.id,
                userId: s.mailUploads.userId,
                userEmail: s.user.email,
                filename: s.mailUploads.filename,
                mimeType: s.mailUploads.mimeType,
                sizeBytes: s.mailUploads.sizeBytes,
                r2Key: s.mailUploads.r2Key,
                isInline: s.mailUploads.isInline,
                createdAt: s.mailUploads.createdAt,
            })
            .from(s.mailUploads)
            .leftJoin(s.user, eq(s.user.id, s.mailUploads.userId))
            .where(where)
            .orderBy(desc(s.mailUploads.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    deleteMailUpload: async (id: number) => {
        await db.delete(s.mailUploads).where(eq(s.mailUploads.id, id))
    },

    // ── Spotify ───────────────────────────────────────────────────────
    listSpotifyAccounts: async (params: { page: number; size: number; q?: string }) => {
        const offset = (params.page - 1) * params.size
        const where = params.q ? or(like(s.user.email, `%${params.q}%`), like(s.spotifyAccounts.email, `%${params.q}%`)) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.spotifyAccounts)
            .innerJoin(s.user, eq(s.user.id, s.spotifyAccounts.userId))
            .where(where)
        const rows = await db
            .select({
                id: s.spotifyAccounts.id,
                userId: s.spotifyAccounts.userId,
                userEmail: s.user.email,
                spotifyUserId: s.spotifyAccounts.spotifyUserId,
                displayName: s.spotifyAccounts.displayName,
                email: s.spotifyAccounts.email,
                isActive: s.spotifyAccounts.isActive,
                createdAt: s.spotifyAccounts.createdAt,
            })
            .from(s.spotifyAccounts)
            .innerJoin(s.user, eq(s.user.id, s.spotifyAccounts.userId))
            .where(where)
            .orderBy(desc(s.spotifyAccounts.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    listSpotifyKeys: async (params: { page: number; size: number; q?: string }) => {
        const offset = (params.page - 1) * params.size
        const where = params.q ? like(s.spotifyApiKeys.name, `%${params.q}%`) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.spotifyApiKeys)
            .where(where)
        const rows = await db
            .select({
                id: s.spotifyApiKeys.id,
                userId: s.spotifyApiKeys.userId,
                spotifyAccountId: s.spotifyApiKeys.spotifyAccountId,
                name: s.spotifyApiKeys.name,
                expiresAt: s.spotifyApiKeys.expiresAt,
                lastUsedAt: s.spotifyApiKeys.lastUsedAt,
                createdAt: s.spotifyApiKeys.createdAt,
            })
            .from(s.spotifyApiKeys)
            .where(where)
            .orderBy(desc(s.spotifyApiKeys.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    revokeSpotifyKey: async (id: number) => {
        await db.delete(s.spotifyApiKeys).where(eq(s.spotifyApiKeys.id, id))
    },

    listSpotifyWidgetTokens: async (params: { page: number; size: number }) => {
        const offset = (params.page - 1) * params.size
        const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(s.spotifyWidgetTokens)
        const rows = await db.select().from(s.spotifyWidgetTokens).orderBy(desc(s.spotifyWidgetTokens.createdAt)).limit(params.size).offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    toggleSpotifyWidgetToken: async (id: number) => {
        const [row] = await db.select().from(s.spotifyWidgetTokens).where(eq(s.spotifyWidgetTokens.id, id)).limit(1)
        if (!row) return
        await db.update(s.spotifyWidgetTokens).set({ isActive: !row.isActive }).where(eq(s.spotifyWidgetTokens.id, id))
    },

    // ── Resume ────────────────────────────────────────────────────────
    listResumes: async (params: { page: number; size: number; q?: string }) => {
        const offset = (params.page - 1) * params.size
        const where = params.q ? like(s.resumes.title, `%${params.q}%`) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.resumes)
            .where(where)
        const rows = await db
            .select({
                id: s.resumes.id,
                userId: s.resumes.userId,
                userEmail: s.user.email,
                type: s.resumes.type,
                title: s.resumes.title,
                isPublic: s.resumes.isPublic,
                createdAt: s.resumes.createdAt,
                updatedAt: s.resumes.updatedAt,
            })
            .from(s.resumes)
            .leftJoin(s.user, eq(s.user.id, s.resumes.userId))
            .where(where)
            .orderBy(desc(s.resumes.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    getResume: async (id: number) => {
        const [row] = await db.select().from(s.resumes).where(eq(s.resumes.id, id)).limit(1)
        return row ?? null
    },

    toggleResumeVisibility: async (id: number) => {
        const [row] = await db.select().from(s.resumes).where(eq(s.resumes.id, id)).limit(1)
        if (!row) return
        await db.update(s.resumes).set({ isPublic: !row.isPublic }).where(eq(s.resumes.id, id))
    },

    deleteResume: async (id: number) => {
        await db.delete(s.resumes).where(eq(s.resumes.id, id))
    },

    // ── Calendar ──────────────────────────────────────────────────────
    listCalendarGroups: async (params: { page: number; size: number }) => {
        const offset = (params.page - 1) * params.size
        const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(s.calendarGroup)
        const rows = await db
            .select({
                id: s.calendarGroup.id,
                userId: s.calendarGroup.userId,
                userEmail: s.user.email,
                name: s.calendarGroup.name,
                color: s.calendarGroup.color,
                sortOrder: s.calendarGroup.sortOrder,
                isVisible: s.calendarGroup.isVisible,
                createdAt: s.calendarGroup.createdAt,
            })
            .from(s.calendarGroup)
            .leftJoin(s.user, eq(s.user.id, s.calendarGroup.userId))
            .orderBy(desc(s.calendarGroup.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    listCalendarEvents: async (params: { page: number; size: number; q?: string; userId?: string; from?: Date; to?: Date }) => {
        const offset = (params.page - 1) * params.size
        const conds = []
        if (params.q) conds.push(like(s.calendarEvent.summary, `%${params.q}%`))
        if (params.userId) conds.push(eq(s.calendarEvent.userId, params.userId))
        if (params.from) conds.push(gte(s.calendarEvent.dtstart, params.from))
        if (params.to) conds.push(lte(s.calendarEvent.dtstart, params.to))
        const where = conds.length ? and(...conds) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.calendarEvent)
            .where(where)
        const rows = await db
            .select({
                id: s.calendarEvent.id,
                userId: s.calendarEvent.userId,
                userEmail: s.user.email,
                summary: s.calendarEvent.summary,
                dtstart: s.calendarEvent.dtstart,
                dtend: s.calendarEvent.dtend,
                status: s.calendarEvent.status,
                groupId: s.calendarEvent.groupId,
                groupName: s.calendarGroup.name,
                isAllDay: s.calendarEvent.isAllDay,
            })
            .from(s.calendarEvent)
            .leftJoin(s.user, eq(s.user.id, s.calendarEvent.userId))
            .leftJoin(s.calendarGroup, eq(s.calendarGroup.id, s.calendarEvent.groupId))
            .where(where)
            .orderBy(desc(s.calendarEvent.dtstart))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    listCalendarSubscriptions: async (params: { page: number; size: number }) => {
        const offset = (params.page - 1) * params.size
        const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(s.calendarSubscription)
        const rows = await db
            .select({
                id: s.calendarSubscription.id,
                userId: s.calendarSubscription.userId,
                userEmail: s.user.email,
                token: s.calendarSubscription.token,
                name: s.calendarSubscription.name,
                isActive: s.calendarSubscription.isActive,
                lastAccessedAt: s.calendarSubscription.lastAccessedAt,
                ctag: s.calendarSubscription.ctag,
                createdAt: s.calendarSubscription.createdAt,
            })
            .from(s.calendarSubscription)
            .leftJoin(s.user, eq(s.user.id, s.calendarSubscription.userId))
            .orderBy(desc(s.calendarSubscription.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    revokeCalendarSubscription: async (id: string) => {
        await db.update(s.calendarSubscription).set({ isActive: false }).where(eq(s.calendarSubscription.id, id))
    },

    listDeletedCalendarEvents: async (params: { page: number; size: number }) => {
        const offset = (params.page - 1) * params.size
        const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(s.deletedCalendarEvent)
        const rows = await db
            .select({
                id: s.deletedCalendarEvent.id,
                userId: s.deletedCalendarEvent.userId,
                userEmail: s.user.email,
                uid: s.deletedCalendarEvent.uid,
                deletedAt: s.deletedCalendarEvent.deletedAt,
                syncToken: s.deletedCalendarEvent.syncToken,
            })
            .from(s.deletedCalendarEvent)
            .leftJoin(s.user, eq(s.user.id, s.deletedCalendarEvent.userId))
            .orderBy(desc(s.deletedCalendarEvent.deletedAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    // ── Drive ─────────────────────────────────────────────────────────
    listDriveAssets: async (params: { page: number; size: number; q?: string; tier?: string; status?: string; userId?: string }) => {
        const offset = (params.page - 1) * params.size
        const conds = []
        if (params.q) conds.push(like(s.cloudAssets.originalName, `%${params.q}%`))
        if (params.tier) conds.push(eq(s.cloudAssets.storageTiers, params.tier))
        if (params.status) conds.push(eq(s.cloudAssets.uploadStatus, params.status))
        if (params.userId) conds.push(eq(s.cloudAssets.userId, params.userId))
        const where = conds.length ? and(...conds) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.cloudAssets)
            .where(where)
        const rows = await db
            .select({
                id: s.cloudAssets.id,
                userId: s.cloudAssets.userId,
                userEmail: s.user.email,
                originalName: s.cloudAssets.originalName,
                mimeType: s.cloudAssets.mimeType,
                sizeBytes: s.cloudAssets.sizeBytes,
                storageTiers: s.cloudAssets.storageTiers,
                uploadStatus: s.cloudAssets.uploadStatus,
                accessCount: s.cloudAssets.accessCount,
                lastViewedAt: s.cloudAssets.lastViewedAt,
                createdAt: s.cloudAssets.createdAt,
            })
            .from(s.cloudAssets)
            .leftJoin(s.user, eq(s.user.id, s.cloudAssets.userId))
            .where(where)
            .orderBy(desc(s.cloudAssets.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    deleteDriveAsset: async (id: number) => {
        await db.delete(s.storageLifecycleLogs).where(eq(s.storageLifecycleLogs.assetId, id))
        await db.delete(s.cloudAssets).where(eq(s.cloudAssets.id, id))
    },

    listDriveFolders: async (params: { page: number; size: number }) => {
        const offset = (params.page - 1) * params.size
        const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(s.driveFolders)
        const rows = await db
            .select({
                id: s.driveFolders.id,
                userId: s.driveFolders.userId,
                userEmail: s.user.email,
                parentId: s.driveFolders.parentId,
                name: s.driveFolders.name,
                createdAt: s.driveFolders.createdAt,
            })
            .from(s.driveFolders)
            .leftJoin(s.user, eq(s.user.id, s.driveFolders.userId))
            .orderBy(desc(s.driveFolders.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    listLifecycleLogs: async (params: { page: number; size: number; assetId?: number }) => {
        const offset = (params.page - 1) * params.size
        const where = params.assetId ? eq(s.storageLifecycleLogs.assetId, params.assetId) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.storageLifecycleLogs)
            .where(where)
        const rows = await db
            .select()
            .from(s.storageLifecycleLogs)
            .where(where)
            .orderBy(desc(s.storageLifecycleLogs.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    // ── AI: Providers ─────────────────────────────────────────────────
    listAiProviders: async (params: { page: number; size: number; q?: string; provider?: string; status?: string }) => {
        const offset = (params.page - 1) * params.size
        const conds = []
        if (params.q) conds.push(like(s.user.email, `%${params.q}%`))
        if (params.provider) conds.push(eq(s.aiProviders.provider, params.provider))
        if (params.status) conds.push(eq(s.aiProviders.status, params.status))
        const where = conds.length ? and(...conds) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.aiProviders)
            .leftJoin(s.user, eq(s.aiProviders.userId, s.user.id))
            .where(where)
        const rows = await db
            .select({
                id: s.aiProviders.id,
                userId: s.aiProviders.userId,
                userEmail: s.user.email,
                provider: s.aiProviders.provider,
                authType: s.aiProviders.authType,
                status: s.aiProviders.status,
                statusDetail: s.aiProviders.statusDetail,
                displayName: s.aiProviders.displayName,
                lastUsedAt: s.aiProviders.lastUsedAt,
                lastRefreshedAt: s.aiProviders.lastRefreshedAt,
                modelsFetchedAt: s.aiProviders.modelsFetchedAt,
                createdAt: s.aiProviders.createdAt,
            })
            .from(s.aiProviders)
            .leftJoin(s.user, eq(s.aiProviders.userId, s.user.id))
            .where(where)
            .orderBy(desc(s.aiProviders.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    setAiProviderStatus: async (id: number, status: string) => {
        await db.update(s.aiProviders).set({ status, statusDetail: null }).where(eq(s.aiProviders.id, id))
    },

    deleteAiProvider: async (id: number) => {
        await db.delete(s.aiProviders).where(eq(s.aiProviders.id, id))
    },

    // ── AI: Sessions ──────────────────────────────────────────────────
    listAiSessions: async (params: { page: number; size: number; q?: string; provider?: string }) => {
        const offset = (params.page - 1) * params.size
        const conds = []
        if (params.q) conds.push(like(s.user.email, `%${params.q}%`))
        if (params.provider) conds.push(eq(s.aiSessions.provider, params.provider))
        const where = conds.length ? and(...conds) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.aiSessions)
            .leftJoin(s.user, eq(s.aiSessions.userId, s.user.id))
            .where(where)
        const rows = await db
            .select({
                id: s.aiSessions.id,
                userId: s.aiSessions.userId,
                userEmail: s.user.email,
                provider: s.aiSessions.provider,
                modelId: s.aiSessions.modelId,
                title: s.aiSessions.title,
                featureKey: s.aiSessions.featureKey,
                lastMessageAt: s.aiSessions.lastMessageAt,
                createdAt: s.aiSessions.createdAt,
            })
            .from(s.aiSessions)
            .leftJoin(s.user, eq(s.aiSessions.userId, s.user.id))
            .where(where)
            .orderBy(desc(s.aiSessions.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },

    // ── AI: Prompts ───────────────────────────────────────────────────
    listAiPrompts: async (params: { page: number; size: number; q?: string; stage?: string }) => {
        const offset = (params.page - 1) * params.size
        const conds = []
        if (params.q) conds.push(or(like(s.user.email, `%${params.q}%`), like(s.aiPrompts.name, `%${params.q}%`)))
        if (params.stage) conds.push(eq(s.aiPrompts.stage, params.stage))
        const where = conds.length ? and(...conds) : undefined
        const [{ c }] = await db
            .select({ c: sql<number>`count(*)` })
            .from(s.aiPrompts)
            .leftJoin(s.user, eq(s.aiPrompts.userId, s.user.id))
            .where(where)
        const rows = await db
            .select({
                id: s.aiPrompts.id,
                userId: s.aiPrompts.userId,
                userEmail: s.user.email,
                name: s.aiPrompts.name,
                stage: s.aiPrompts.stage,
                featureKey: s.aiPrompts.featureKey,
                sortOrder: s.aiPrompts.sortOrder,
                isActive: s.aiPrompts.isActive,
                createdAt: s.aiPrompts.createdAt,
            })
            .from(s.aiPrompts)
            .leftJoin(s.user, eq(s.aiPrompts.userId, s.user.id))
            .where(where)
            .orderBy(desc(s.aiPrompts.createdAt))
            .limit(params.size)
            .offset(offset)
        return { rows, total: Number(c ?? 0) }
    },
})
