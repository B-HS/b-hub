import { createAppError } from '../../../lib/error'

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'
const MAX_RETRIES = 3

type SpotifyProviderDeps = {
    betterAuthAccountId: string
    getOAuthToken: (accountId: string) => Promise<{ accessToken: string; refreshToken?: string } | null>
    refreshOAuthToken: (betterAuthAccountId: string, refreshToken: string) => Promise<string>
}

export const createSpotifyProvider = (deps: SpotifyProviderDeps) => {
    let currentAccessToken: string | null = null
    let refreshPromise: Promise<string> | null = null

    const ensureToken = async () => {
        if (currentAccessToken) return currentAccessToken
        const token = await deps.getOAuthToken(deps.betterAuthAccountId)
        if (!token?.accessToken) throw createAppError('SPOTIFY_API_ERROR', { detail: 'No access token' })
        currentAccessToken = token.accessToken
        return currentAccessToken
    }

    const refreshToken = async (): Promise<string> => {
        if (refreshPromise) return refreshPromise

        refreshPromise = (async () => {
            try {
                const token = await deps.getOAuthToken(deps.betterAuthAccountId)
                if (!token?.refreshToken) throw createAppError('SPOTIFY_API_ERROR', { detail: 'No refresh token' })
                const newAccessToken = await deps.refreshOAuthToken(deps.betterAuthAccountId, token.refreshToken)
                currentAccessToken = newAccessToken
                return newAccessToken
            } finally {
                refreshPromise = null
            }
        })()

        return refreshPromise
    }

    const spotifyFetch = async (path: string, options: RequestInit = {}, retries = MAX_RETRIES): Promise<Response> => {
        const accessToken = await ensureToken()
        const url = path.startsWith('http') ? path : `${SPOTIFY_API_BASE}${path}`

        const res = await fetch(url, {
            ...options,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...options.headers,
            },
        })

        if (res.status === 401 && retries > 0) {
            await refreshToken()
            return spotifyFetch(path, options, retries - 1)
        }

        if (res.status === 429 && retries > 0) {
            const raw = res.headers.get('Retry-After') ?? '1'
            const parsed = parseInt(raw, 10)
            const retryAfter = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 60) : 1
            await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
            return spotifyFetch(path, options, retries - 1)
        }

        return res
    }

    const getCurrentlyPlaying = async () => {
        const res = await spotifyFetch('/me/player/currently-playing')
        if (res.status === 204 || res.status === 202) return null
        if (!res.ok) throw createAppError('SPOTIFY_API_ERROR', { status: res.status })
        return res.json()
    }

    const getRecentlyPlayed = async (limit = 1) => {
        const res = await spotifyFetch(`/me/player/recently-played?limit=${limit}`)
        if (!res.ok) throw createAppError('SPOTIFY_API_ERROR', { status: res.status })
        return res.json()
    }

    const getPlaylists = async (limit = 20, offset = 0) => {
        const res = await spotifyFetch(`/me/playlists?limit=${limit}&offset=${offset}`)
        if (!res.ok) throw createAppError('SPOTIFY_API_ERROR', { status: res.status })
        return res.json()
    }

    const disconnect = () => {
        currentAccessToken = null
        refreshPromise = null
    }

    return { spotifyFetch, getCurrentlyPlaying, getRecentlyPlayed, getPlaylists, disconnect }
}

export type SpotifyProvider = ReturnType<typeof createSpotifyProvider>
