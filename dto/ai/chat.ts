import { z } from 'zod'
import { aiProviderNameSchema } from './provider'

export const aiChatSendSchema = z.object({
    content: z.string().min(1).max(100000),
    attachmentIds: z.array(z.coerce.number().int().positive()).max(20).optional(),
    modelId: z.string().min(1).max(100).optional(),
    maxTokens: z.coerce.number().int().min(1).max(32000).optional(),
    temperature: z.coerce.number().min(0).max(2).optional(),
})

export const aiCompletionMessageSchema = z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().min(1).max(100000),
})

export const aiCompletionSchema = z.object({
    provider: aiProviderNameSchema,
    modelId: z.string().min(1).max(100),
    messages: z.array(aiCompletionMessageSchema).min(1).max(100),
    promptIds: z.array(z.coerce.number().int().positive()).max(50).optional(),
    featureKey: z.string().max(50).optional(),
    maxTokens: z.coerce.number().int().min(1).max(32000).optional(),
    temperature: z.coerce.number().min(0).max(2).optional(),
})

export const aiMessageListQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const aiMessageResponseSchema = z.object({
    id: z.number(),
    sessionId: z.string(),
    role: z.string(),
    content: z.string(),
    modelId: z.string().nullable(),
    inputTokens: z.number().nullable(),
    outputTokens: z.number().nullable(),
    durationMs: z.number().nullable(),
    createdAt: z.string(),
})

export type AiChatSend = z.infer<typeof aiChatSendSchema>
export type AiCompletionMessage = z.infer<typeof aiCompletionMessageSchema>
export type AiCompletion = z.infer<typeof aiCompletionSchema>
export type AiMessageListQuery = z.infer<typeof aiMessageListQuerySchema>
