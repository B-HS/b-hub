import { z } from 'zod'

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
