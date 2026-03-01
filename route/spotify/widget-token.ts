import { Hono } from 'hono'
import { validator } from 'hono-openapi/zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { withAuth } from '../../lib/with-auth'
import { successResponse } from '../../lib/api-response'
import { spotifyWidgetTokenCreateSchema, spotifyWidgetTokenToggleSchema } from '../../dto/spotify/widget-token'
import type { SpotifyWidgetTokenService } from '../../service/domain/spotify/spotify-widget-token'
import type { SpotifyAccountService } from '../../service/domain/spotify/spotify-account'
import type { AuthContext } from '../../lib/hono-types'
import type { z } from 'zod'

type SpotifyWidgetTokenRouteDeps = {
    spotifyWidgetTokenService: SpotifyWidgetTokenService
    spotifyAccountService: SpotifyAccountService
    getSession: Parameters<typeof withAuth>[0]['getSession']
}

export const createSpotifyWidgetTokenRoute = (deps: SpotifyWidgetTokenRouteDeps) => {
    const route = new Hono<AuthContext>()

    route.get(
        '/',
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const tokens = await deps.spotifyWidgetTokenService.listByUser(user.id)
                const data = tokens.map((t) => ({
                    id: t.id,
                    spotifyAccountId: t.spotifyAccountId,
                    token: t.token,
                    name: t.name,
                    isActive: t.isActive,
                    createdAt: t.createdAt.toISOString(),
                }))
                return c.json(successResponse(data))
            }),
        ),
    )

    route.post(
        '/',
        validator('json', spotifyWidgetTokenCreateSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const body = c.req.valid('json' as never) as z.infer<typeof spotifyWidgetTokenCreateSchema>
                await deps.spotifyAccountService.getById(body.spotifyAccountId, user.id)
                const result = await deps.spotifyWidgetTokenService.create(user.id, body.spotifyAccountId, body.name)
                return c.json(successResponse(result))
            }),
        ),
    )

    route.delete(
        '/:id',
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const tokenId = parseInt(c.req.param('id'), 10)
                await deps.spotifyWidgetTokenService.revoke(user.id, tokenId)
                return c.json(successResponse({ deleted: true }))
            }),
        ),
    )

    route.patch(
        '/:id/active',
        validator('json', spotifyWidgetTokenToggleSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const tokenId = parseInt(c.req.param('id'), 10)
                const body = c.req.valid('json' as never) as z.infer<typeof spotifyWidgetTokenToggleSchema>
                await deps.spotifyWidgetTokenService.toggleActive(user.id, tokenId, body.isActive)
                return c.json(successResponse({ id: tokenId, isActive: body.isActive }))
            }),
        ),
    )

    return route
}
