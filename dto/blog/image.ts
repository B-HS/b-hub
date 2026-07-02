import { z } from 'zod'

export const imagePrepareResponseSchema = z.object({
    assetId: z.string(),
    s3Key: z.string(),
    uploadToken: z.string(),
    uploadUrl: z.string(),
    expiresAt: z.number(),
})

export const imageCompleteRequestSchema = z.object({
    assetId: z.uuid(),
    s3Key: z.string(),
    uploadToken: z.string(),
    sizeBytes: z.number().int().positive(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
})

export const imageCompleteResponseSchema = z.object({
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
            id: z.string(),
            r2Key: z.string(),
            url: z.string(),
            mimeType: z.string(),
            sizeBytes: z.number(),
            width: z.number().nullable(),
            height: z.number().nullable(),
            createdAt: z.string(),
        }),
    ),
})

export type ImagePrepareResponse = z.infer<typeof imagePrepareResponseSchema>
export type ImageCompleteRequest = z.infer<typeof imageCompleteRequestSchema>
export type ImageCompleteResponse = z.infer<typeof imageCompleteResponseSchema>
