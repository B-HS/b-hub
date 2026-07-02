import { z } from 'zod'

export const successResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
    z.object({
        success: z.literal(true),
        data: dataSchema,
    })

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
    z.object({
        success: z.literal(true),
        data: z.array(dataSchema),
        pagination: z.object({
            page: z.number(),
            limit: z.number(),
            total: z.number(),
            totalPages: z.number(),
        }),
    })

export const errorResponseSchema = z.object({
    success: z.literal(false),
    error: z.object({
        code: z.string(),
        message: z.string(),
        details: z.record(z.string(), z.unknown()).optional(),
    }),
})

export const successResponse = <T>(data: T) => ({
    success: true as const,
    data,
})

export const paginatedResponse = <T>(data: T[], pagination: { page: number; limit: number; total: number }) => ({
    success: true as const,
    data,
    pagination: {
        ...pagination,
        totalPages: Math.ceil(pagination.total / pagination.limit),
    },
})

export const errorResponse = (code: string, message: string, details?: Record<string, unknown>) => ({
    success: false as const,
    error: {
        code,
        message,
        ...(details && process.env.NODE_ENV !== 'production' && { details }),
    },
})
