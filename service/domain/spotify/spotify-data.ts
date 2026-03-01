import type { SpotifyProvider } from './spotify-provider'

type SpotifyTrack = {
    name: string
    artist: string
    album: string
    albumArt: string | null
    externalUrl: string | null
    durationMs: number
    progressMs: number | null
}

type NowPlayingResult = {
    isPlaying: boolean
    track: SpotifyTrack | null
    lastPlayedAt: string | null
}

type PlaylistItem = {
    id: string
    name: string
    description: string | null
    imageUrl: string | null
    trackCount: number
    isPublic: boolean
    externalUrl: string | null
}

type PlaylistsResult = {
    items: PlaylistItem[]
    total: number
    limit: number
    offset: number
}

type SpotifyDataServiceDeps = {
    createProvider: (spotifyAccountId: number) => Promise<SpotifyProvider>
}

const extractTrack = (item: Record<string, unknown>): SpotifyTrack => {
    const artists = (item.artists as { name: string }[]) ?? []
    const album = item.album as { name?: string; images?: { url: string }[] } | undefined
    const externalUrls = item.external_urls as { spotify?: string } | undefined

    return {
        name: (item.name as string) ?? '',
        artist: artists.map((a) => a.name).join(', '),
        album: album?.name ?? '',
        albumArt: album?.images?.[0]?.url ?? null,
        externalUrl: externalUrls?.spotify ?? null,
        durationMs: (item.duration_ms as number) ?? 0,
        progressMs: null,
    }
}

export const createSpotifyDataService = (deps: SpotifyDataServiceDeps) => {
    const getNowPlaying = async (spotifyAccountId: number): Promise<NowPlayingResult> => {
        const provider = await deps.createProvider(spotifyAccountId)

        try {
            const data = await provider.getCurrentlyPlaying()

            if (data && data.is_playing && data.item) {
                const track = extractTrack(data.item as Record<string, unknown>)
                track.progressMs = (data.progress_ms as number) ?? null
                return { isPlaying: true, track, lastPlayedAt: null }
            }

            const recentData = (await provider.getRecentlyPlayed(1)) as { items?: { track: Record<string, unknown>; played_at: string }[] }
            const recentItem = recentData?.items?.[0]
            if (recentItem) {
                return {
                    isPlaying: false,
                    track: extractTrack(recentItem.track),
                    lastPlayedAt: recentItem.played_at,
                }
            }

            return { isPlaying: false, track: null, lastPlayedAt: null }
        } finally {
            provider.disconnect()
        }
    }

    const getPlaylists = async (spotifyAccountId: number, limit = 20, offset = 0): Promise<PlaylistsResult> => {
        const provider = await deps.createProvider(spotifyAccountId)

        try {
            const data = (await provider.getPlaylists(limit, offset)) as {
                items: Record<string, unknown>[]
                total: number
                limit: number
                offset: number
            }

            const items: PlaylistItem[] = (data.items ?? []).map((item) => {
                const images = item.images as { url: string }[] | undefined
                const externalUrls = item.external_urls as { spotify?: string } | undefined
                const tracks = item.tracks as { total?: number } | undefined

                return {
                    id: (item.id as string) ?? '',
                    name: (item.name as string) ?? '',
                    description: (item.description as string) ?? null,
                    imageUrl: images?.[0]?.url ?? null,
                    trackCount: tracks?.total ?? 0,
                    isPublic: (item.public as boolean) ?? false,
                    externalUrl: externalUrls?.spotify ?? null,
                }
            })

            return {
                items,
                total: data.total ?? 0,
                limit: data.limit ?? limit,
                offset: data.offset ?? offset,
            }
        } finally {
            provider.disconnect()
        }
    }

    return { getNowPlaying, getPlaylists }
}

export type SpotifyDataService = ReturnType<typeof createSpotifyDataService>
