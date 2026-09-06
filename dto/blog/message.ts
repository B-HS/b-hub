import { z } from 'zod'

export const messageListQuerySchema = z.object({
    userId: z.string().min(1),
    page: z.coerce.number().int().positive().default(1),
    size: z.coerce.number().int().min(1).max(100).default(20),
})

export const messageIdParamSchema = z.object({
    id: z.string().min(1),
})

export const messageCreateSchema = z.object({
    body: z.string().min(1).max(10000),
    imageIds: z.array(z.uuid()).default([]),
    replyToId: z.string().nullable().default(null),
    retweetOfId: z.string().nullable().default(null),
})

export const messageResponseSchema = z.object({
    id: z.string(),
    userId: z.string(),
    body: z.string(),
    replyToId: z.string().nullable(),
    retweetOfId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().nullable(),
    images: z.array(
        z.object({
            id: z.string(),
            url: z.string(),
            mimeType: z.string(),
            width: z.number().nullable(),
            height: z.number().nullable(),
        }),
    ),
    user: z.object({
        id: z.string(),
        name: z.string(),
        image: z.string().nullable(),
    }),
})

export const userProfileResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
    followersCount: z.number(),
    followingCount: z.number(),
})

export type MessageCreateInput = z.infer<typeof messageCreateSchema>
