import { z } from 'zod'

export const driveAssetListQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    mimeType: z.string().optional(),
    folderId: z.string().optional(),
    sort: z.enum(['created', 'name', 'size']).default('created'),
    order: z.enum(['asc', 'desc']).default('desc'),
})

export const driveAssetParamSchema = z.object({
    assetId: z.coerce.number().int().positive(),
})

export const driveAssetUpdateSchema = z.object({
    originalName: z.string().min(1).max(255).optional(),
    isPublic: z.boolean().optional(),
    folderId: z.string().nullable().optional(),
})

export type DriveAssetListQuery = z.infer<typeof driveAssetListQuerySchema>
export type DriveAssetParam = z.infer<typeof driveAssetParamSchema>
export type DriveAssetUpdateInput = z.infer<typeof driveAssetUpdateSchema>
