import { z } from 'zod'

export const spotifyAccountUpdateSchema = z.object({
    displayName: z.string().max(100).optional(),
    isActive: z.boolean().optional(),
})

export const spotifyAccountParamSchema = z.object({
    accountId: z.coerce.number().int().positive(),
})

export const spotifyAccountResponseSchema = z.object({
    id: z.number(),
    spotifyUserId: z.string(),
    displayName: z.string().nullable(),
    email: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
})

export type SpotifyAccountUpdate = z.infer<typeof spotifyAccountUpdateSchema>
