import { z } from 'zod'

export const mailAttachmentDownloadParamSchema = z.object({
    messageId: z.coerce.number().int().positive(),
    attachmentId: z.coerce.number().int().positive(),
})
