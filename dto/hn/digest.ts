import { z } from 'zod'

export const digestListQuerySchema = z.object({
    type: z.enum(['daily', 'weekly', 'monthly']),
    limit: z.coerce.number().int().min(1).max(50).default(30),
})

export const digestDetailParamSchema = z.object({
    type: z.enum(['daily', 'weekly', 'monthly']),
    key: z.string().min(1),
})

export const digestResponseSchema = z.object({
    id: z.number(),
    digestType: z.string(),
    digestKey: z.string(),
    title: z.string(),
    content: z.string(),
    storyIds: z.array(z.number()).nullable(),
    createdAt: z.string().nullable(),
})

export const cronSyncResponseSchema = z.object({
    success: z.literal(true),
    synced: z.object({
        top: z.object({
            synced: z.number(),
            updated: z.number(),
            parsed: z.number(),
        }),
        best: z.object({
            synced: z.number(),
            updated: z.number(),
            parsed: z.number(),
        }),
        new: z.object({
            synced: z.number(),
            updated: z.number(),
            parsed: z.number(),
        }),
    }),
})

export const cronDailyResponseSchema = z.object({
    success: z.literal(true),
    summarized: z.number(),
    date: z.string(),
})
