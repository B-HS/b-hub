import { z } from 'zod'

export const METRICS_PAYLOAD_MAX_BYTES = 65536
export const METRICS_BATCH_MAX = 50

export const metricsIngestSchema = z.object({
    deviceId: z.string().min(1).max(64),
    hostname: z.string().max(255).optional(),
    os: z.string().max(64).optional(),
    arch: z.string().max(32).optional(),
    agentVersion: z.string().max(64).optional(),
    intervalSec: z.coerce.number().int().positive().max(86400).optional(),
    payload: z.record(z.string(), z.unknown()),
})

export const metricsIngestBatchSchema = z.object({
    events: z.array(metricsIngestSchema).min(1),
})

export type MetricsIngestInput = z.infer<typeof metricsIngestSchema>
export type MetricsIngestBatchInput = z.infer<typeof metricsIngestBatchSchema>
