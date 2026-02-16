import { z } from 'zod'

export const tagCreateSchema = z.object({
    tag: z.string().min(1).max(255),
})

export const tagIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
})

export const tagResponseSchema = z.object({
    tagId: z.number(),
    tag: z.string(),
})

export type TagCreateInput = z.infer<typeof tagCreateSchema>
