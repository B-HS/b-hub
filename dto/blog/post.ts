import { z } from 'zod'

export const postListQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    keyword: z.string().optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    tagId: z.coerce.number().int().positive().optional(),
    isPublished: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
    isHide: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
    isNotice: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
})

export const postIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
})

export const postCreateSchema = z.object({
    title: z.string().min(1).max(255),
    description: z.string().min(1),
    categoryId: z.number().int().positive(),
    tagIds: z.array(z.number().int().positive()).default([]),
    isPublished: z.boolean().default(false),
})

export const postUpdateSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().min(1).optional(),
    categoryId: z.number().int().positive().optional(),
    tagIds: z.array(z.number().int().positive()).optional(),
    isPublished: z.boolean().optional(),
    isHide: z.boolean().optional(),
    isNotice: z.boolean().optional(),
    isComment: z.boolean().optional(),
})

export const postResponseSchema = z.object({
    postId: z.number(),
    categoryId: z.number(),
    categoryName: z.string().nullable(),
    title: z.string(),
    description: z.string(),
    updatedAt: z.string(),
    createdAt: z.string(),
    views: z.number(),
    isPublished: z.boolean(),
    isHide: z.boolean(),
    isNotice: z.boolean(),
    isComment: z.boolean(),
    tags: z.array(z.object({ tagId: z.number(), tag: z.string() })),
})

export type PostListQuery = z.infer<typeof postListQuerySchema>
export type PostCreateInput = z.infer<typeof postCreateSchema>
export type PostUpdateInput = z.infer<typeof postUpdateSchema>
