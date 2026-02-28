import { z } from 'zod'

export const mailFolderListQuerySchema = z.object({
    accountId: z.coerce.number().int().positive(),
})

export const mailFolderResponseSchema = z.object({
    id: z.number(),
    accountId: z.number(),
    name: z.string(),
    type: z.string(),
    parentId: z.number().nullable(),
    messageCount: z.number(),
    unreadCount: z.number(),
})
