import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import * as schema from '../db/schema'
import { createCredentialCrypto } from '../lib/credential-crypto'
import { captureException } from '../lib/sentry'
import { createAppError } from '../lib/error'
import { createRateLimiter } from '../lib/rate-limit'
import { createAiProviderFactory } from '../service/domain/ai/ai-provider-factory'
import { createAiConnectionService } from '../service/domain/ai/ai-connection'
import { createAiModelService } from '../service/domain/ai/ai-model'
import { createAiPromptService } from '../service/domain/ai/ai-prompt'
import { createAiSessionService } from '../service/domain/ai/ai-session'
import { createAiAttachmentService } from '../service/domain/ai/ai-attachment'
import { createAiChatService } from '../service/domain/ai/ai-chat'
import type { AiUsageLogger } from '../service/domain/ai/ai-chat'
import type { ComposeAiArgs } from './types'

const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token'
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'

export const composeAi = ({ db, env, storageService, logEventService }: ComposeAiArgs) => {
    if (!env.AI_ENCRYPTION_KEY) return {}

    const crypto = createCredentialCrypto(env.AI_ENCRYPTION_KEY)

    const factory = createAiProviderFactory({
        crypto,
        refreshCodexToken: async (refreshToken) => {
            const res = await fetch(CODEX_TOKEN_URL, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ client_id: CODEX_CLIENT_ID, grant_type: 'refresh_token', refresh_token: refreshToken }),
            })
            if (!res.ok) {
                throw createAppError('AI_TOKEN_REFRESH_FAILED', { status: res.status })
            }
            const data = (await res.json()) as { access_token?: string; refresh_token?: string; id_token?: string }
            if (!data.access_token) throw createAppError('AI_TOKEN_REFRESH_FAILED', { detail: 'missing access_token' })
            return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null, idToken: data.id_token ?? null }
        },
        persistCodexCredentials: async (providerId, encryptedCredentials) => {
            await db
                .update(schema.aiProviders)
                .set({ credentials: encryptedCredentials, lastRefreshedAt: new Date() })
                .where(eq(schema.aiProviders.id, providerId))
        },
        markReauthRequired: async (providerId, detail) => {
            await db
                .update(schema.aiProviders)
                .set({ status: 'reauth_required', statusDetail: detail.slice(0, 255) })
                .where(eq(schema.aiProviders.id, providerId))
        },
    })

    const connectionDb = {
        getByUserAndProvider: async (userId: string, provider: string) => {
            const [row] = await db
                .select()
                .from(schema.aiProviders)
                .where(and(eq(schema.aiProviders.userId, userId), eq(schema.aiProviders.provider, provider)))
                .limit(1)
            return row ?? null
        },
        getById: async (id: number) => {
            const [row] = await db.select().from(schema.aiProviders).where(eq(schema.aiProviders.id, id)).limit(1)
            return row ?? null
        },
        listByUser: async (userId: string) =>
            db.select().from(schema.aiProviders).where(eq(schema.aiProviders.userId, userId)).orderBy(desc(schema.aiProviders.createdAt)),
        insert: async (data: schema.NewAiProvider) => {
            const [res] = await db.insert(schema.aiProviders).values(data).$returningId()
            return { id: res.id }
        },
        updateCredentials: async (id: number, encryptedCredentials: string) => {
            await db.update(schema.aiProviders).set({ credentials: encryptedCredentials }).where(eq(schema.aiProviders.id, id))
        },
        updateStatus: async (id: number, status: string, statusDetail: string | null) => {
            await db.update(schema.aiProviders).set({ status, statusDetail }).where(eq(schema.aiProviders.id, id))
        },
        updateDisplayName: async (id: number, displayName: string | null) => {
            await db.update(schema.aiProviders).set({ displayName }).where(eq(schema.aiProviders.id, id))
        },
        touchUsed: async (id: number) => {
            await db.update(schema.aiProviders).set({ lastUsedAt: new Date() }).where(eq(schema.aiProviders.id, id))
        },
        touchModelsFetched: async (id: number) => {
            await db.update(schema.aiProviders).set({ modelsFetchedAt: new Date() }).where(eq(schema.aiProviders.id, id))
        },
        remove: async (id: number) => {
            await db.delete(schema.aiProviders).where(eq(schema.aiProviders.id, id))
        },
    }

    const connectionService = createAiConnectionService({ db: connectionDb, crypto, factory })

    const modelDb = {
        listByProvider: async (providerId: number) =>
            db.select().from(schema.aiModels).where(eq(schema.aiModels.providerId, providerId)).orderBy(schema.aiModels.modelId),
        replaceForProvider: async (
            providerId: number,
            models: { modelId: string; displayName: string | null; metadata: Record<string, unknown> | null }[],
        ) => {
            await db.transaction(async (tx) => {
                await tx.delete(schema.aiModels).where(eq(schema.aiModels.providerId, providerId))
                if (models.length > 0) {
                    await tx.insert(schema.aiModels).values(
                        models.map((m) => ({
                            providerId,
                            modelId: m.modelId,
                            displayName: m.displayName,
                            metadata: m.metadata,
                            fetchedAt: new Date(),
                        })),
                    )
                }
            })
        },
    }

    const modelService = createAiModelService({ db: modelDb, connectionService })

    const promptDb = {
        listByUser: async (userId: string, filter: { featureKey?: string; stage?: string }) => {
            const conds = [eq(schema.aiPrompts.userId, userId)]
            if (filter.featureKey) conds.push(eq(schema.aiPrompts.featureKey, filter.featureKey))
            if (filter.stage) conds.push(eq(schema.aiPrompts.stage, filter.stage))
            return db
                .select()
                .from(schema.aiPrompts)
                .where(and(...conds))
                .orderBy(schema.aiPrompts.sortOrder)
        },
        getById: async (id: number) => {
            const [row] = await db.select().from(schema.aiPrompts).where(eq(schema.aiPrompts.id, id)).limit(1)
            return row ?? null
        },
        getByIds: async (ids: number[]) => (ids.length === 0 ? [] : db.select().from(schema.aiPrompts).where(inArray(schema.aiPrompts.id, ids))),
        insert: async (data: schema.NewAiPrompt) => {
            const [res] = await db.insert(schema.aiPrompts).values(data).$returningId()
            return { id: res.id }
        },
        update: async (id: number, data: Partial<schema.NewAiPrompt>) => {
            await db.update(schema.aiPrompts).set(data).where(eq(schema.aiPrompts.id, id))
        },
        remove: async (id: number) => {
            await db.delete(schema.aiPrompts).where(eq(schema.aiPrompts.id, id))
        },
    }

    const promptService = createAiPromptService({ db: promptDb })

    const sessionDb = {
        listByUser: async (userId: string, filter: { featureKey?: string; page: number; limit: number }) => {
            const conds = [eq(schema.aiSessions.userId, userId)]
            if (filter.featureKey) conds.push(eq(schema.aiSessions.featureKey, filter.featureKey))
            const where = and(...conds)
            const [{ total }] = await db
                .select({ total: sql<number>`count(*)` })
                .from(schema.aiSessions)
                .where(where)
            const rows = await db
                .select()
                .from(schema.aiSessions)
                .where(where)
                .orderBy(desc(schema.aiSessions.lastMessageAt), desc(schema.aiSessions.createdAt))
                .limit(filter.limit)
                .offset((filter.page - 1) * filter.limit)
            return { rows, total: Number(total) }
        },
        getById: async (id: string) => {
            const [row] = await db.select().from(schema.aiSessions).where(eq(schema.aiSessions.id, id)).limit(1)
            return row ?? null
        },
        insert: async (data: schema.NewAiSession) => {
            await db.insert(schema.aiSessions).values(data)
        },
        update: async (id: string, data: { title?: string | null; modelId?: string; promptIds?: number[] | null }) => {
            await db.update(schema.aiSessions).set(data).where(eq(schema.aiSessions.id, id))
        },
        remove: async (id: string) => {
            await db.delete(schema.aiSessions).where(eq(schema.aiSessions.id, id))
        },
        touchLastMessage: async (id: string) => {
            await db.update(schema.aiSessions).set({ lastMessageAt: new Date() }).where(eq(schema.aiSessions.id, id))
        },
        listMessages: async (sessionId: string, filter: { page: number; limit: number }) => {
            const where = eq(schema.aiMessages.sessionId, sessionId)
            const [{ total }] = await db
                .select({ total: sql<number>`count(*)` })
                .from(schema.aiMessages)
                .where(where)
            const rows = await db
                .select()
                .from(schema.aiMessages)
                .where(where)
                .orderBy(schema.aiMessages.createdAt)
                .limit(filter.limit)
                .offset((filter.page - 1) * filter.limit)
            return { rows, total: Number(total) }
        },
        listRecentMessages: async (sessionId: string, limit: number) => {
            const rows = await db
                .select()
                .from(schema.aiMessages)
                .where(eq(schema.aiMessages.sessionId, sessionId))
                .orderBy(desc(schema.aiMessages.createdAt))
                .limit(limit)
            return rows.reverse()
        },
        insertMessage: async (data: schema.NewAiMessage) => {
            const [res] = await db.insert(schema.aiMessages).values(data).$returningId()
            return { id: res.id }
        },
    }

    const sessionService = createAiSessionService({ db: sessionDb, generateId: () => globalThis.crypto.randomUUID() })

    const aiStorageAdapter = {
        upload: async (key: string, body: Buffer, contentType: string) => {
            await storageService.upload(key, body, contentType)
        },
        delete: storageService.del,
        getUrl: storageService.getUrl,
        download: async (key: string) => storageService.getObject(key),
    }

    const attachmentDb = {
        insert: async (data: schema.NewAiAttachment) => {
            const [res] = await db.insert(schema.aiAttachments).values(data).$returningId()
            return { id: res.id }
        },
        getById: async (id: number) => {
            const [row] = await db.select().from(schema.aiAttachments).where(eq(schema.aiAttachments.id, id)).limit(1)
            return row ?? null
        },
        getByIds: async (ids: number[]) =>
            ids.length === 0 ? [] : db.select().from(schema.aiAttachments).where(inArray(schema.aiAttachments.id, ids)),
        getTotalSizeByUser: async (userId: string) => {
            const [row] = await db
                .select({ total: sql<number>`coalesce(sum(size_bytes), 0)` })
                .from(schema.aiAttachments)
                .where(eq(schema.aiAttachments.userId, userId))
            return Number(row?.total ?? 0)
        },
        attachToMessage: async (ids: number[], messageId: number) => {
            if (ids.length === 0) return
            await db.update(schema.aiAttachments).set({ messageId }).where(inArray(schema.aiAttachments.id, ids))
        },
        deleteById: async (id: number) => {
            await db.delete(schema.aiAttachments).where(eq(schema.aiAttachments.id, id))
        },
    }

    const attachmentService = createAiAttachmentService({
        storage: aiStorageAdapter,
        db: attachmentDb,
        generateId: () => globalThis.crypto.randomUUID(),
        getUserQuotaBytes: async (userId: string) => {
            const [u] = await db.select({ quota: schema.user.storageQuotaBytes }).from(schema.user).where(eq(schema.user.id, userId)).limit(1)
            return u?.quota ?? 10 * 1024 * 1024
        },
    })

    const logUsage: AiUsageLogger = (entry) => {
        logEventService
            .ingest(
                {
                    service: 'b-hub-ai',
                    errorCode: entry.errorCode,
                    severity: entry.severity,
                    errorDescription: entry.errorDescription,
                    category: 'ai',
                    details: entry.details,
                },
                { source: 'server' },
            )
            .catch((err) => captureException(err))
    }

    const chatService = createAiChatService({ connectionService, promptService, sessionService, attachmentService, logUsage })

    const aiRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })
    const aiCheckLimit = (key: string, path: string) => aiRateLimiter.checkLimit(`ai:${key}:${path}`)

    return {
        aiConnectionService: connectionService,
        aiModelService: modelService,
        aiPromptService: promptService,
        aiSessionService: sessionService,
        aiAttachmentService: attachmentService,
        aiChatService: chatService,
        aiCheckLimit,
    }
}
