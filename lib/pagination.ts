import { z } from 'zod'

export const paginationQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

export const calcOffset = (page: number, limit: number) => (page - 1) * limit

export const calcTotalPages = (total: number, limit: number) => Math.ceil(total / limit)

export const buildPagination = (page: number, limit: number, total: number) => ({
    page,
    limit,
    total,
    totalPages: calcTotalPages(total, limit),
    hasNext: page < calcTotalPages(total, limit),
    hasPrev: page > 1,
})
