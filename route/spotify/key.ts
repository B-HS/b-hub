import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { resolver, validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { withAuth } from '../../lib/with-auth'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { spotifyApiKeyCreateSchema, spotifyApiKeyResponseSchema } from '../../dto/spotify/api-key'
import type { SpotifyApiKeyService } from '../../service/domain/spotify/spotify-api-key'
import type { SpotifyAccountService } from '../../service/domain/spotify/spotify-account'
import type { AuthContext } from '../../lib/hono-types'

type SpotifyKeyRouteDeps = {
    spotifyApiKeyService: SpotifyApiKeyService
    spotifyAccountService: SpotifyAccountService
    getSession: Parameters<typeof withAuth>[0]['getSession']
}

export const createSpotifyKeyRoute = (deps: SpotifyKeyRouteDeps) => {
    const route = new Hono<AuthContext>()

    route.get(
        '/',
        describeRoute({
            tags: ['Spotify'],
            summary: 'Spotify API 키 목록 조회',
            responses: {
                200: {
                    description: '키 목록',
                    content: {
                        'application/json': {
                            schema: resolver(z.object({ success: z.literal(true), data: z.array(spotifyApiKeyResponseSchema) })),
                        },
                    },
                },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const keys = await deps.spotifyApiKeyService.listByUser(user.id)
                const data = keys.map((k) => ({
                    id: k.id,
                    spotifyAccountId: k.spotifyAccountId,
                    name: k.name,
                    expiresAt: k.expiresAt?.toISOString() ?? null,
                    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
                    createdAt: k.createdAt.toISOString(),
                }))
                return c.json(successResponse(data))
            }),
        ),
    )

    route.post(
        '/',
        describeRoute({
            tags: ['Spotify'],
            summary: 'Spotify API 키 발급',
            responses: {
                200: {
                    description: '발급된 키 (1회만 표시)',
                    content: {
                        'application/json': {
                            schema: resolver(z.object({ success: z.literal(true), data: z.object({ key: z.string() }) })),
                        },
                    },
                },
                ...errorResponses(['UNAUTHORIZED', 'SPOTIFY_ACCOUNT_NOT_FOUND']),
            },
        }),
        validator('json', spotifyApiKeyCreateSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const body = c.req.valid('json' as never) as z.infer<typeof spotifyApiKeyCreateSchema>
                await deps.spotifyAccountService.getById(body.spotifyAccountId, user.id)
                const key = await deps.spotifyApiKeyService.create(user.id, body.spotifyAccountId, body.name)
                return c.json(successResponse({ key }))
            }),
        ),
    )

    route.delete(
        '/:id',
        describeRoute({
            tags: ['Spotify'],
            summary: 'Spotify API 키 삭제',
            responses: {
                200: { description: '삭제 완료' },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const keyId = parseInt(c.req.param('id'), 10)
                await deps.spotifyApiKeyService.revoke(user.id, keyId)
                return c.json(successResponse({ deleted: true }))
            }),
        ),
    )

    return route
}
