import { z } from 'zod'

export const driveFolderCreateSchema = z.object({
    name: z.string().min(1).max(255),
    parentId: z.string().nullable().optional(),
})

export const driveFolderUpdateSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    parentId: z.string().nullable().optional(),
})

export const driveFolderListQuerySchema = z.object({
    parentId: z.string().optional(),
})

export const driveFolderParamSchema = z.object({
    folderId: z.string(),
})

export type DriveFolderCreateInput = z.infer<typeof driveFolderCreateSchema>
export type DriveFolderUpdateInput = z.infer<typeof driveFolderUpdateSchema>
export type DriveFolderListQuery = z.infer<typeof driveFolderListQuerySchema>
export type DriveFolderParam = z.infer<typeof driveFolderParamSchema>
