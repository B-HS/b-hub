import { z } from 'zod'

export const playlistsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    offset: z.coerce.number().int().min(0).default(0),
})

export type PlaylistsQuery = z.infer<typeof playlistsQuerySchema>
