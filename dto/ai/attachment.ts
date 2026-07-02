import { z } from 'zod'

export const aiAttachmentParamSchema = z.object({
    attachmentId: z.coerce.number().int().positive(),
})

export const aiAttachmentResponseSchema = z.object({
    id: z.number(),
    filename: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number(),
    url: z.string(),
    createdAt: z.string(),
})

export type AiAttachmentResponse = z.infer<typeof aiAttachmentResponseSchema>
