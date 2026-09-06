import { z } from 'zod'

export const aiModelResponseSchema = z.object({
    id: z.number(),
    providerId: z.number(),
    modelId: z.string(),
    displayName: z.string(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    fetchedAt: z.string(),
})

export type AiModelResponse = z.infer<typeof aiModelResponseSchema>
