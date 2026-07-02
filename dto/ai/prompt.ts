import { z } from 'zod'

export const AI_PROMPT_STAGE = { SYSTEM: 'system', CONTEXT: 'context', USER: 'user', ASSISTANT: 'assistant' } as const

export const aiPromptStageSchema = z.enum(['system', 'context', 'user', 'assistant'])

export const aiPromptCreateSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(255).optional(),
    stage: aiPromptStageSchema.default('system'),
    content: z.string().min(1).max(20000),
    featureKey: z.string().max(50).optional(),
    sortOrder: z.coerce.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
})

export const aiPromptUpdateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(255).optional(),
    stage: aiPromptStageSchema.optional(),
    content: z.string().min(1).max(20000).optional(),
    featureKey: z.string().max(50).optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
})

export const aiPromptListQuerySchema = z.object({
    featureKey: z.string().max(50).optional(),
    stage: aiPromptStageSchema.optional(),
})

export const aiPromptParamSchema = z.object({
    promptId: z.coerce.number().int().positive(),
})

export const aiPromptResponseSchema = z.object({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable(),
    stage: z.string(),
    content: z.string(),
    featureKey: z.string().nullable(),
    sortOrder: z.number(),
    isActive: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
})

export type AiPromptStage = z.infer<typeof aiPromptStageSchema>
export type AiPromptCreate = z.infer<typeof aiPromptCreateSchema>
export type AiPromptUpdate = z.infer<typeof aiPromptUpdateSchema>
export type AiPromptListQuery = z.infer<typeof aiPromptListQuerySchema>
