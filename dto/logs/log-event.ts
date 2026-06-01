import { z } from 'zod'

export const SEVERITY = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40, FATAL: 50 } as const

export const severityNameSchema = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'])

export const logEventIngestSchema = z.object({
    service: z.string().min(1).max(64),
    errorCode: z.string().min(1).max(64),
    errorDescription: z.string().max(2000).optional(),
    severity: z
        .union([severityNameSchema, z.coerce.number().int().min(0).max(100)])
        .default(20)
        .transform((v) => (typeof v === 'number' ? v : SEVERITY[v])),
    category: z.string().max(64).optional(),
    deviceId: z.string().max(64).optional(),
    firmwareVersion: z.string().max(32).optional(),
    source: z.string().max(32).optional(),
    correlationId: z.string().max(36).optional(),
    sessionId: z.string().max(36).optional(),
    retryCount: z.coerce.number().int().min(0).optional(),
    occurredAt: z.coerce.date().optional(),
    details: z.record(z.unknown()).optional(),
})

export const logEventBatchSchema = z.object({
    events: z.array(logEventIngestSchema).min(1),
})

export const logEventResolveSchema = z.object({
    resolvedAt: z.coerce.date().optional(),
})

export const logEventListQuerySchema = z.object({
    service: z.string().optional(),
    severityGte: z.coerce.number().int().optional(),
    category: z.string().optional(),
    deviceId: z.string().optional(),
    errorCode: z.string().optional(),
    correlationId: z.string().optional(),
    unresolved: z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => v === 'true'),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
})

export const logEventResponseSchema = z.object({
    id: z.number(),
    service: z.string(),
    errorCode: z.string(),
    errorDescription: z.string().nullable(),
    severity: z.number(),
    category: z.string().nullable(),
    deviceId: z.string().nullable(),
    firmwareVersion: z.string().nullable(),
    source: z.string().nullable(),
    correlationId: z.string().nullable(),
    sessionId: z.string().nullable(),
    retryCount: z.number().nullable(),
    occurredAt: z.string().nullable(),
    resolvedAt: z.string().nullable(),
    details: z.record(z.unknown()).nullable(),
    ingestIp: z.string().nullable(),
    createdAt: z.string(),
})

export type SeverityName = z.infer<typeof severityNameSchema>
export type LogEventIngest = z.infer<typeof logEventIngestSchema>
export type LogEventBatch = z.infer<typeof logEventBatchSchema>
export type LogEventResolve = z.infer<typeof logEventResolveSchema>
export type LogEventListQuery = z.infer<typeof logEventListQuerySchema>
export type LogEventResponse = z.infer<typeof logEventResponseSchema>
