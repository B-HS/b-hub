import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import * as schema from '../db/schema'
import { escapeLikePattern } from '../lib/sql-utils'
import { createHnFetcherService } from '../service/domain/hn/hn-fetcher'
import { createContentParser } from '../service/domain/hn/hn-content-parser'
import { createHnTranslator } from '../service/domain/hn/hn-translator'
import * as cheerio from 'cheerio'
import { createHnDigestService } from '../service/domain/hn/hn-digest'
import { createHnWebhookService } from '../service/domain/hn/hn-webhook'
import type { ComposeHnArgs } from './types'

export const composeHn = ({ db, env }: ComposeHnArgs) => {
    const hnStoryDb = {
        getStoriesPaginated: async (type: string | undefined, limit: number, offset: number) => {
            const { hnStories } = schema
            let query = db.select().from(hnStories).$dynamic()
            if (type) query = query.where(eq(hnStories.type, type))
            return query.orderBy(desc(hnStories.time)).limit(limit).offset(offset)
        },
        getStoryById: async (id: number) => {
            const [story] = await db.select().from(schema.hnStories).where(eq(schema.hnStories.id, id)).limit(1)
            return story ?? null
        },
        getSummariesByStoryIds: async (ids: number[]) => {
            if (ids.length === 0) return []
            return db.select().from(schema.hnSummaries).where(inArray(schema.hnSummaries.storyId, ids))
        },
        getSummaryByStoryId: async (id: number) => {
            const [summary] = await db.select().from(schema.hnSummaries).where(eq(schema.hnSummaries.storyId, id)).limit(1)
            return summary ?? null
        },
        getCommentsByStoryId: async (id: number) => {
            return db
                .select()
                .from(schema.hnComments)
                .where(eq(schema.hnComments.storyId, id))
                .orderBy(schema.hnComments.depth, schema.hnComments.time)
        },
        getAllTags: async () => {
            return db.select().from(schema.hnTags).orderBy(desc(schema.hnTags.usageCount))
        },
        getStoriesByTagName: async (name: string, limit: number, offset: number) => {
            const stories = await db
                .select()
                .from(schema.hnStories)
                .where(sql`JSON_CONTAINS(${schema.hnStories.tags}, ${JSON.stringify(name)})`)
                .orderBy(desc(schema.hnStories.score))
                .limit(limit)
                .offset(offset)

            const storyIds = stories.map((s) => s.id)
            const summaries = storyIds.length > 0 ? await db.select().from(schema.hnSummaries).where(inArray(schema.hnSummaries.storyId, storyIds)) : []

            return { stories, summaries }
        },
        searchStories: async (q: string, limit: number) => {
            return db.select().from(schema.hnStories).where(sql`${schema.hnStories.title} LIKE ${`%${escapeLikePattern(q)}%`} ESCAPE '\\\\'`).orderBy(desc(schema.hnStories.score)).limit(limit)
        },
        getStoryCounts: async () => {
            const types = ['top', 'new', 'best'] as const
            const results = await Promise.all(
                types.map(async (type) => {
                    const [result] = await db
                        .select({ count: sql<number>`count(*)` })
                        .from(schema.hnStories)
                        .where(eq(schema.hnStories.type, type))
                    return { type, count: result?.count ?? 0 }
                }),
            )
            return results
        },
    }

    const hnDigestDb = {
        getDigestsByType: async (type: string, limit: number) => {
            return db.select().from(schema.hnDigests).where(eq(schema.hnDigests.digestType, type)).orderBy(desc(schema.hnDigests.createdAt)).limit(limit)
        },
        getDigestByTypeAndKey: async (type: string, key: string) => {
            const [digest] = await db
                .select()
                .from(schema.hnDigests)
                .where(and(eq(schema.hnDigests.digestType, type), eq(schema.hnDigests.digestKey, key)))
                .limit(1)
            return digest ?? null
        },
        getStoriesByIds: async (ids: number[]) => {
            if (ids.length === 0) return []
            return db.select().from(schema.hnStories).where(inArray(schema.hnStories.id, ids))
        },
        getSummariesByStoryIds: async (ids: number[]) => {
            if (ids.length === 0) return []
            return db.select().from(schema.hnSummaries).where(inArray(schema.hnSummaries.storyId, ids))
        },
    }

    const hnFetcherDb = {
        ...hnStoryDb,
        getExistingStoryIds: async (ids: number[]) => {
            if (ids.length === 0) return []
            return db
                .select({ id: schema.hnStories.id, score: schema.hnStories.score, descendants: schema.hnStories.descendants })
                .from(schema.hnStories)
                .where(inArray(schema.hnStories.id, ids))
        },
        upsertStory: async (data: Record<string, unknown>) => {
            await db
                .insert(schema.hnStories)
                .values(data as never)
                .onDuplicateKeyUpdate({ set: data as never })
        },
        updateStoryMeta: async (id: number, data: { score: number; descendants: number; needsResummarize: boolean }) => {
            await db.update(schema.hnStories).set(data).where(eq(schema.hnStories.id, id))
        },
        deleteCommentsByStoryId: async (storyId: number) => {
            await db.delete(schema.hnComments).where(eq(schema.hnComments.storyId, storyId))
        },
        insertCommentsBatch: async (commentsList: Record<string, unknown>[]) => {
            if (commentsList.length === 0) return
            await db.insert(schema.hnComments).values(commentsList as never)
        },
        getUnsummarizedStories: async (limit: number) => {
            return db
                .select()
                .from(schema.hnStories)
                .where(eq(schema.hnStories.needsResummarize, true))
                .orderBy(desc(schema.hnStories.score))
                .limit(limit)
        },
        getStoriesForPeriod: async (startTime: number, endTime: number, limit: number) => {
            return db
                .select()
                .from(schema.hnStories)
                .where(and(gte(schema.hnStories.time, startTime), lte(schema.hnStories.time, endTime)))
                .orderBy(desc(schema.hnStories.score))
                .limit(limit)
        },
        markStorySummarized: async (storyId: number) => {
            await db.update(schema.hnStories).set({ needsResummarize: false }).where(eq(schema.hnStories.id, storyId))
        },
    }

    const hnDigestServiceDb = {
        getUnsummarizedStories: hnFetcherDb.getUnsummarizedStories,
        getCommentsByStoryId: hnStoryDb.getCommentsByStoryId,
        saveSummary: async (storyId: number, summary: string, summaryTags: string[], summaryType: string) => {
            await db
                .insert(schema.hnSummaries)
                .values({ storyId, summary, tags: summaryTags, summaryType })
                .onDuplicateKeyUpdate({ set: { summary, tags: summaryTags, summaryType } })
        },
        markStorySummarized: hnFetcherDb.markStorySummarized,
        getSummaryByStoryId: hnStoryDb.getSummaryByStoryId,
        getRecentSummaries: async (summaryType: string, limit: number) => {
            return db
                .select()
                .from(schema.hnSummaries)
                .where(eq(schema.hnSummaries.summaryType, summaryType))
                .orderBy(desc(schema.hnSummaries.createdAt))
                .limit(limit)
        },
        getStoriesByIds: hnDigestDb.getStoriesByIds,
        upsertDigest: async (data: { digestType: string; digestKey: string; title: string; content: string; storyIds: number[] }) => {
            await db
                .insert(schema.hnDigests)
                .values(data)
                .onDuplicateKeyUpdate({ set: { content: data.content, storyIds: data.storyIds } })
        },
        getStoriesForPeriod: hnFetcherDb.getStoriesForPeriod,
        getSummariesByStoryIds: hnDigestDb.getSummariesByStoryIds,
    }

    const hnWebhookDb = {
        getActiveWebhooks: async (digestType: string) => {
            const list = await db
                .select()
                .from(schema.hnWebhooks)
                .where(eq(schema.hnWebhooks.isActive, true))

            return list
                .filter((w) => (w.digestTypes ?? []).includes(digestType))
                .map((w) => ({ id: w.id, provider: w.provider, url: w.url, name: w.name, digestTypes: w.digestTypes }))
        },
        getWebhookById: async (id: number) => {
            const [webhook] = await db.select().from(schema.hnWebhooks).where(eq(schema.hnWebhooks.id, id)).limit(1)
            return webhook ? { id: webhook.id, provider: webhook.provider, url: webhook.url, name: webhook.name } : null
        },
        registerWebhook: async (data: { url: string; name?: string; provider: string; digestTypes: string[] }) => {
            await db.insert(schema.hnWebhooks).values({
                url: data.url,
                name: data.name ?? null,
                provider: data.provider,
                digestTypes: data.digestTypes,
            })
        },
        deactivateWebhook: async (id: number) => {
            await db.update(schema.hnWebhooks).set({ isActive: false }).where(eq(schema.hnWebhooks.id, id))
        },
        deleteWebhook: async (id: number) => {
            await db.delete(schema.hnWebhooks).where(eq(schema.hnWebhooks.id, id))
        },
        listWebhooks: async () => {
            return db.select().from(schema.hnWebhooks)
        },
        webhookExists: async (url: string) => {
            const [existing] = await db.select().from(schema.hnWebhooks).where(eq(schema.hnWebhooks.url, url)).limit(1)
            return !!existing
        },
        logWebhook: async (data: {
            webhookId: number
            provider: string
            digestType: string
            status: string
            payload: Record<string, unknown>
            response: string
        }) => {
            await db.insert(schema.hnWebhookLogs).values(data)
        },
        deleteWebhooksByUrl: async (url: string) => {
            const existing = await db.select().from(schema.hnWebhooks).where(eq(schema.hnWebhooks.url, url))
            for (const webhook of existing) {
                await db.delete(schema.hnWebhooks).where(eq(schema.hnWebhooks.id, webhook.id))
            }
            return existing.length
        },
    }

    let genai: InstanceType<typeof import('@google/genai').GoogleGenAI> | null = null

    const getGenAI = async () => {
        if (!genai) {
            const { GoogleGenAI } = await import('@google/genai')
            genai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY ?? '' })
        }
        return genai
    }

    const hnAi = {
        summarize: async (prompt: string, maxTokens?: number) => {
            const ai = await getGenAI()
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-lite',
                contents: prompt,
                ...(maxTokens && { config: { maxOutputTokens: maxTokens } }),
            })
            return response.text ?? ''
        },
    }

    const contentParser = createContentParser({ cheerio })

    const translatorDb = {
        getExistingTags: async () => {
            const list = await db
                .select({ name: schema.hnTags.name })
                .from(schema.hnTags)
                .orderBy(desc(schema.hnTags.usageCount))
                .limit(50)
            return list.map((t) => t.name)
        },
        updateTagUsage: async (tagNames: string[]) => {
            for (const name of tagNames) {
                await db
                    .insert(schema.hnTags)
                    .values({ name, usageCount: 1 })
                    .onDuplicateKeyUpdate({ set: { usageCount: sql`usage_count + 1` } })
            }
        },
    }

    const hnTranslator = createHnTranslator({ ai: hnAi, db: translatorDb })

    const hnFetcher = createHnFetcherService({
        db: hnFetcherDb,
        contentParser,
        translator: hnTranslator,
    })
    const hnDigest = createHnDigestService({ ai: hnAi, db: hnDigestServiceDb })
    const hnWebhook = createHnWebhookService({ db: hnWebhookDb })

    return { hnStoryDb, hnDigestDb, hnFetcher, hnDigest, hnWebhook }
}
