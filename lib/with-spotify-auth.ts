import type { Context } from 'hono'
import { createAppError } from './error'
import type { SpotifyApiKeyService } from '../service/domain/spotify/spotify-api-key'
import type { SpotifyAccountService } from '../service/domain/spotify/spotify-account'
import type { HonoVariables } from './hono-types'

type AuthUser = HonoVariables['user']
type GetSessionFn = (c: Context) => Promise<{ user: AuthUser } | null>

type SpotifyAuthResult = {
    spotifyAccountId: number
    userId: string
}

type SpotifyAuthHandler = (c: Context, auth: SpotifyAuthResult) => Promise<Response>

type SpotifyAuthDeps = {
    spotifyApiKeyService: SpotifyApiKeyService
    getSession: GetSessionFn
    spotifyAccountService: SpotifyAccountService
}

export const withSpotifyAuth =
    (deps: SpotifyAuthDeps) =>
    (handler: SpotifyAuthHandler) =>
    async (c: Context) => {
        const apiKey = c.req.header('X-Spotify-Key')

        if (apiKey) {
            const result = await deps.spotifyApiKeyService.validate(apiKey)
            if (!result) throw createAppError('SPOTIFY_KEY_INVALID')
            return handler(c, { spotifyAccountId: result.spotifyAccountId, userId: result.userId })
        }

        const session = await deps.getSession(c)
        if (!session) throw createAppError('UNAUTHORIZED')

        const accountIdParam = c.req.query('accountId')
        if (!accountIdParam) throw createAppError('VALIDATION_ERROR', { message: 'accountId query parameter is required' })

        const accountId = parseInt(accountIdParam, 10)
        if (isNaN(accountId) || accountId <= 0) throw createAppError('VALIDATION_ERROR', { message: 'Invalid accountId' })

        await deps.spotifyAccountService.getById(accountId, session.user.id)

        return handler(c, { spotifyAccountId: accountId, userId: session.user.id })
    }
