import { z } from 'zod'

export const categoryCreateSchema = z.object({
    category: z.string().min(1).max(255),
})

export const categoryIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
})

export const categoryResponseSchema = z.object({
    categoryId: z.number(),
    category: z.string(),
    isHide: z.boolean(),
})

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>
