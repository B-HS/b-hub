import { createAppError } from '../../../lib/error'

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'
const MAX_RETRIES = 3
const MAX_TOTAL_RETRY_WAIT_MS = 3000
const DEFAULT_RETRY_AFTER_SECONDS = 1
const MS_PER_SECOND = 1000

export type SpotifyTokenRefreshResult = { accessToken: string } | { status: number }

type SpotifyAccountLookup = { betterAuthAccountId: string | null; isActive: boolean }

type SpotifyProviderDeps = {
    betterAuthAccountId: string
    getOAuthToken: (accountId: string) => Promise<{ accessToken: string; refreshToken?: string } | null>
    refreshOAuthToken: (betterAuthAccountId: string, refreshToken: string) => Promise<SpotifyTokenRefreshResult>
}

type SpotifyProviderFactoryDeps = Omit<SpotifyProviderDeps, 'betterAuthAccountId'> & {
    findAccount: (spotifyAccountId: number) => Promise<SpotifyAccountLookup | null>
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
                const refreshed = await deps.refreshOAuthToken(deps.betterAuthAccountId, token.refreshToken)
                if ('status' in refreshed) throw createAppError('SPOTIFY_API_ERROR', { status: refreshed.status })
                currentAccessToken = refreshed.accessToken
                return refreshed.accessToken
            } finally {
                refreshPromise = null
            }
        })()

        return refreshPromise
    }

    const spotifyFetch = async (path: string, options: RequestInit = {}, retries = MAX_RETRIES, waitedMs = 0): Promise<Response> => {
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
            return spotifyFetch(path, options, retries - 1, waitedMs)
        }

        if (res.status === 429 && retries > 0) {
            const parsed = parseInt(res.headers.get('Retry-After') ?? '', 10)
            const retryAfterSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETRY_AFTER_SECONDS
            const waitMs = retryAfterSeconds * MS_PER_SECOND
            if (waitedMs + waitMs > MAX_TOTAL_RETRY_WAIT_MS) throw createAppError('SPOTIFY_API_ERROR', { status: res.status })
            await new Promise((resolve) => setTimeout(resolve, waitMs))
            return spotifyFetch(path, options, retries - 1, waitedMs + waitMs)
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

export const createSpotifyProviderFactory = (deps: SpotifyProviderFactoryDeps) => async (spotifyAccountId: number) => {
    const account = await deps.findAccount(spotifyAccountId)
    if (!account?.isActive || !account.betterAuthAccountId) throw createAppError('SPOTIFY_ACCOUNT_NOT_FOUND')

    return createSpotifyProvider({
        betterAuthAccountId: account.betterAuthAccountId,
        getOAuthToken: deps.getOAuthToken,
        refreshOAuthToken: deps.refreshOAuthToken,
    })
}

export type SpotifyProvider = ReturnType<typeof createSpotifyProvider>
