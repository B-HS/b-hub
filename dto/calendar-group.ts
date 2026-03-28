import { z } from 'zod'

export const createGroupSchema = z.object({
    name: z.string().min(1).max(255),
    color: z.string().min(1).max(50),
})

export const updateGroupSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    color: z.string().min(1).max(50).optional(),
    sortOrder: z.number().int().optional(),
    isVisible: z.boolean().optional(),
})

export type CreateGroupInput = z.infer<typeof createGroupSchema>
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>
