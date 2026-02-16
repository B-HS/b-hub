import { z } from 'zod'

export const storyListQuerySchema = z.object({
    type: z.enum(['top', 'best', 'new']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type StoryListQuery = z.infer<typeof storyListQuerySchema>

export const storyIdParamSchema = z.object({
    id: z.coerce.number().int(),
})

export const searchQuerySchema = z.object({
    q: z.string().min(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const tagStoriesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const storyResponseSchema = z.object({
    id: z.number(),
    type: z.string(),
    hnType: z.string(),
    by: z.string().nullable(),
    title: z.string().nullable(),
    titleKo: z.string().nullable(),
    url: z.string().nullable(),
    score: z.number().nullable(),
    descendants: z.number().nullable(),
    tags: z.array(z.string()).nullable(),
    time: z.number().nullable(),
    createdAt: z.string().nullable(),
})
