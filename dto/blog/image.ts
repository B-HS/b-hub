import { z } from 'zod'

export const imageUploadResponseSchema = z.object({
    id: z.string(),
    url: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number(),
    width: z.number().nullable(),
    height: z.number().nullable(),
})

export const imageListResponseSchema = z.object({
    images: z.array(
        z.object({
            imageId: z.number(),
            fileName: z.string(),
            originalName: z.string(),
            url: z.string(),
            mimeType: z.string(),
            fileSize: z.number(),
            width: z.number(),
            height: z.number(),
            createdAt: z.string(),
        }),
    ),
})
