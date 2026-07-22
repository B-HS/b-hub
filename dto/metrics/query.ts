import { z } from 'zod'

export const metricsLogListQuerySchema = z.object({
    deviceId: z.string().max(64).optional(),
    tokenId: z.coerce.number().int().positive().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
})

export const metricsSeriesQuerySchema = z.object({
    deviceId: z.string().min(1).max(64),
    field: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(2000).default(500),
})

export const metricsDeviceResponseSchema = z.object({
    deviceId: z.string(),
    tokenId: z.number(),
    tokenAlias: z.string(),
    hostname: z.string().nullable(),
    os: z.string().nullable(),
    arch: z.string().nullable(),
    agentVersion: z.string().nullable(),
    intervalSec: z.number().nullable(),
    firstSeenAt: z.string(),
    lastSeenAt: z.string(),
    online: z.boolean(),
})

export const metricsLogResponseSchema = z.object({
    tokenId: z.number(),
    tokenAlias: z.string(),
    deviceId: z.string(),
    hostname: z.string().nullable(),
    os: z.string().nullable(),
    arch: z.string().nullable(),
    agentVersion: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()),
    receivedAt: z.string(),
})

export type MetricsLogListQuery = z.infer<typeof metricsLogListQuerySchema>
export type MetricsSeriesQuery = z.infer<typeof metricsSeriesQuerySchema>
export type MetricsDeviceResponse = z.infer<typeof metricsDeviceResponseSchema>
export type MetricsLogResponse = z.infer<typeof metricsLogResponseSchema>
