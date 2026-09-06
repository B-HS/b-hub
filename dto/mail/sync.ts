import { z } from 'zod'

export const MAIL_HISTORICAL_BATCH_SIZE_MIN = 10
export const MAIL_HISTORICAL_BATCH_SIZE_MAX = 500
export const MAIL_HISTORICAL_BATCH_SIZE_DEFAULT = 100

export const mailSyncTriggerSchema = z.object({
    accountId: z.number().int().positive(),
    folderId: z.number().int().positive().optional(),
})

export const mailHistoricalSyncSchema = z.object({
    accountId: z.number().int().positive(),
    folderId: z.number().int().positive().optional(),
    batchSize: z.number().int().min(MAIL_HISTORICAL_BATCH_SIZE_MIN).max(MAIL_HISTORICAL_BATCH_SIZE_MAX).default(MAIL_HISTORICAL_BATCH_SIZE_DEFAULT),
    cursor: z.string().max(500).optional(),
})

export const mailSyncStatusQuerySchema = z.object({
    accountId: z.coerce.number().int().positive(),
})
