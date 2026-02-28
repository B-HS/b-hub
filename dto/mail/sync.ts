import { z } from 'zod'

export const mailSyncTriggerSchema = z.object({
    accountId: z.number().int().positive(),
    folderId: z.number().int().positive().optional(),
})

export const mailHistoricalSyncSchema = z.object({
    accountId: z.number().int().positive(),
    folderId: z.number().int().positive().optional(),
    batchSize: z.number().int().min(10).max(500).default(100),
    cursor: z.string().max(500).optional(),
})

export const mailSyncStatusQuerySchema = z.object({
    accountId: z.coerce.number().int().positive(),
})
