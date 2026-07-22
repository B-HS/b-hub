import { z } from 'zod'

export const METRICS_TOKEN_SCOPE = {
    CLIENT: 'client',
    ADMIN: 'admin',
} as const

export type MetricsTokenScope = (typeof METRICS_TOKEN_SCOPE)[keyof typeof METRICS_TOKEN_SCOPE]

export const metricsTokenCreateSchema = z.object({
    alias: z.string().min(1).max(100),
    scope: z.enum([METRICS_TOKEN_SCOPE.CLIENT, METRICS_TOKEN_SCOPE.ADMIN]).default(METRICS_TOKEN_SCOPE.CLIENT),
    expiresInDays: z.coerce.number().int().positive().max(3650).optional(),
    dailyLimit: z.coerce.number().int().positive().max(1000000).optional(),
})

export const metricsTokenResponseSchema = z.object({
    id: z.number(),
    alias: z.string(),
    scope: z.string(),
    dailyLimit: z.number(),
    expiresAt: z.string().nullable(),
    lastUsedAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
    createdAt: z.string(),
})

export type MetricsTokenCreateInput = z.infer<typeof metricsTokenCreateSchema>
export type MetricsTokenResponse = z.infer<typeof metricsTokenResponseSchema>
