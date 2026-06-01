import { z } from 'zod'

export const deviceKeyCreateSchema = z.object({
    deviceId: z.string().max(64).optional(),
    label: z.string().max(100).optional(),
})

export const deviceKeyResponseSchema = z.object({
    id: z.number(),
    deviceId: z.string().nullable(),
    label: z.string().nullable(),
    dailyLimit: z.number(),
    lastUsedAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
    createdAt: z.string(),
})

export type DeviceKeyCreateInput = z.infer<typeof deviceKeyCreateSchema>
export type DeviceKeyResponse = z.infer<typeof deviceKeyResponseSchema>
