import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { playlistsQuerySchema } from '../../dto/spotify/data'
import { withSpotifyAuth } from '../../lib/with-spotify-auth'
import type { SpotifyDataService } from '../../service/domain/spotify/spotify-data'
import type { SpotifyApiKeyService } from '../../service/domain/spotify/spotify-api-key'
import type { SpotifyAccountService } from '../../service/domain/spotify/spotify-account'
import type { AuthContext } from '../../lib/hono-types'
import type { z } from 'zod'

type SpotifyDataRouteDeps = {
    spotifyDataService: SpotifyDataService
    spotifyApiKeyService: SpotifyApiKeyService
    spotifyAccountService: SpotifyAccountService
    getSession: Parameters<typeof withSpotifyAuth>[0]['getSession']
}

export const createSpotifyDataRoute = (deps: SpotifyDataRouteDeps) => {
    const route = new Hono<AuthContext>()

    const auth = withSpotifyAuth({
        spotifyApiKeyService: deps.spotifyApiKeyService,
        getSession: deps.getSession,
        spotifyAccountService: deps.spotifyAccountService,
    })

    route.get(
        '/now-playing',
        describeRoute({
            tags: ['Spotify'],
            summary: '현재 재생 중인 트랙 조회',
            responses: {
                200: { description: '현재 재생 정보' },
                ...errorResponses(['UNAUTHORIZED', 'SPOTIFY_KEY_INVALID', 'SPOTIFY_API_ERROR']),
            },
        }),
        withErrorHandling(auth(async (c, authResult) => {
            const data = await deps.spotifyDataService.getNowPlaying(authResult.spotifyAccountId)
            return c.json(successResponse(data))
        })),
    )

    route.get(
        '/playlists',
        describeRoute({
            tags: ['Spotify'],
            summary: '플레이리스트 목록 조회',
            responses: {
                200: { description: '플레이리스트 목록' },
                ...errorResponses(['UNAUTHORIZED', 'SPOTIFY_KEY_INVALID', 'SPOTIFY_API_ERROR']),
            },
        }),
        validator('query', playlistsQuerySchema),
        withErrorHandling(auth(async (c, authResult) => {
            const query = c.req.valid('query' as never) as z.infer<typeof playlistsQuerySchema>
            const data = await deps.spotifyDataService.getPlaylists(authResult.spotifyAccountId, query.limit, query.offset)
            return c.json(successResponse(data))
        })),
    )

    return route
}
