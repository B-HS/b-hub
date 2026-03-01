import { z } from 'zod'

export const spotifyApiKeyCreateSchema = z.object({
    spotifyAccountId: z.number().int().positive(),
    name: z.string().max(100).optional(),
})

export const spotifyApiKeyResponseSchema = z.object({
    id: z.number(),
    spotifyAccountId: z.number(),
    name: z.string().nullable(),
    expiresAt: z.string().nullable(),
    lastUsedAt: z.string().nullable(),
    createdAt: z.string(),
})

export type SpotifyApiKeyCreate = z.infer<typeof spotifyApiKeyCreateSchema>
