import { z } from 'zod'

export const createWeatherKeyBodySchema = z.object({
    name: z.string().max(100).optional(),
})

export const updateWeatherKeyLimitBodySchema = z.object({
    dailyLimit: z.number().int().min(1).max(100000),
})

export const weatherKeyResponseSchema = z.object({
    id: z.number(),
    name: z.string().nullable(),
    dailyLimit: z.number(),
    todayUsage: z.number(),
    expiresAt: z.string().nullable(),
    lastUsedAt: z.string().nullable(),
    createdAt: z.string(),
})
