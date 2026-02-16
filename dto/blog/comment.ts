import { z } from 'zod'

export const commentListQuerySchema = z.object({
    postId: z.coerce.number().int().positive(),
})

export const commentIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
})

export const commentCreateSchema = z.object({
    postId: z.number().int().positive(),
    comment: z.string().min(1).max(5000),
    isHide: z.boolean().default(false),
})

export const commentUpdateSchema = z.object({
    comment: z.string().min(1).max(5000).optional(),
    isHide: z.boolean().optional(),
})

export const commentResponseSchema = z.object({
    commentId: z.number(),
    postId: z.number(),
    userId: z.string(),
    userName: z.string(),
    userImage: z.string().nullable(),
    comment: z.string(),
    updatedAt: z.string(),
    createdAt: z.string(),
    isHide: z.boolean(),
})

export type CommentCreateInput = z.infer<typeof commentCreateSchema>
export type CommentUpdateInput = z.infer<typeof commentUpdateSchema>
