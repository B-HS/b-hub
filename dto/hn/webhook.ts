import { z } from 'zod'
import { isPublicUrl } from '../../lib/url-validator'

export const webhookCreateSchema = z.object({
    url: z.string().url().refine(isPublicUrl, { message: 'HTTPS public URL만 허용됩니다' }),
    digestTypes: z.array(z.enum(['daily', 'weekly', 'monthly'])).default(['daily', 'weekly', 'monthly']),
})

export const webhookIdParamSchema = z.object({
    id: z.coerce.number().int(),
})

export const webhookDeleteByUrlSchema = z.object({
    url: z.string().url().refine(isPublicUrl, { message: 'HTTPS public URL만 허용됩니다' }),
})

export const webhookResponseSchema = z.object({
    id: z.number(),
    provider: z.string(),
    url: z.string(),
    name: z.string().nullable(),
    isActive: z.boolean().nullable(),
    digestTypes: z.array(z.string()).nullable(),
    createdAt: z.string().nullable(),
})
