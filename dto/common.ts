import { z } from 'zod'

export const idParamSchema = z.object({
    id: z.coerce.number().int().positive(),
})

export const stringIdParamSchema = z.object({
    id: z.string().min(1),
})

export const paginationQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const searchQuerySchema = z.object({
    q: z.string().min(1).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const timestampSchema = z.object({
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
})
