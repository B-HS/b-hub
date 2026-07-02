import { z } from 'zod'
import { aiProviderNameSchema } from './provider'

export const aiSessionCreateSchema = z.object({
    provider: aiProviderNameSchema,
    modelId: z.string().min(1).max(100),
    title: z.string().max(255).optional(),
    featureKey: z.string().max(50).optional(),
    promptIds: z.array(z.coerce.number().int().positive()).max(50).optional(),
})

export const aiSessionUpdateSchema = z.object({
    title: z.string().max(255).optional(),
    modelId: z.string().min(1).max(100).optional(),
    promptIds: z.array(z.coerce.number().int().positive()).max(50).optional(),
})

export const aiSessionListQuerySchema = z.object({
    featureKey: z.string().max(50).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const aiSessionParamSchema = z.object({
    sessionId: z.string().min(1).max(36),
})

export const aiSessionResponseSchema = z.object({
    id: z.string(),
    provider: z.string(),
    modelId: z.string(),
    title: z.string().nullable(),
    featureKey: z.string().nullable(),
    promptIds: z.array(z.number()).nullable(),
    lastMessageAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
})

export type AiSessionCreate = z.infer<typeof aiSessionCreateSchema>
export type AiSessionUpdate = z.infer<typeof aiSessionUpdateSchema>
export type AiSessionListQuery = z.infer<typeof aiSessionListQuerySchema>
