import { z } from 'zod'

export const spotifyWidgetTokenCreateSchema = z.object({
    spotifyAccountId: z.number().int().positive(),
    name: z.string().max(100).optional(),
})

export const spotifyWidgetTokenToggleSchema = z.object({
    isActive: z.boolean(),
})

export const spotifyWidgetTokenResponseSchema = z.object({
    id: z.number(),
    spotifyAccountId: z.number(),
    token: z.string(),
    name: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: z.string(),
})

export type SpotifyWidgetTokenCreate = z.infer<typeof spotifyWidgetTokenCreateSchema>
export type SpotifyWidgetTokenToggle = z.infer<typeof spotifyWidgetTokenToggleSchema>
