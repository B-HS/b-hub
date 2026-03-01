import { Hono } from 'hono'
import { withErrorHandling } from '../../lib/with-error-handling'
import { successResponse } from '../../lib/api-response'
import type { SpotifyWidgetTokenService } from '../../service/domain/spotify/spotify-widget-token'
import type { SpotifyWidgetService } from '../../service/domain/spotify/spotify-widget'

type SpotifyPlayingRouteDeps = {
    spotifyWidgetTokenService: SpotifyWidgetTokenService
    spotifyWidgetService: SpotifyWidgetService
    baseUrl: string
}

export const createSpotifyPlayingRoute = (deps: SpotifyPlayingRouteDeps) => {
    const route = new Hono()

    route.get(
        '/:token',
        withErrorHandling(async (c) => {
            const token = c.req.param('token')
            const { spotifyAccountId } = await deps.spotifyWidgetTokenService.validate(token)
            const svg = await deps.spotifyWidgetService.generateSvg(spotifyAccountId)
            c.header('Content-Type', 'image/svg+xml')
            c.header('Cache-Control', 'no-cache, max-age=0, no-store, must-revalidate')
            return c.body(svg)
        }),
    )

    route.get(
        '/:token/widget',
        withErrorHandling(async (c) => {
            const token = c.req.param('token')
            await deps.spotifyWidgetTokenService.validate(token)
            const html = deps.spotifyWidgetService.generateHtmlWidget(token, deps.baseUrl)
            c.header('Content-Type', 'text/html; charset=utf-8')
            c.header('Cache-Control', 'no-cache, max-age=0')
            return c.body(html)
        }),
    )

    route.get(
        '/:token/data',
        withErrorHandling(async (c) => {
            const token = c.req.param('token')
            const { spotifyAccountId } = await deps.spotifyWidgetTokenService.validate(token)
            const data = await deps.spotifyWidgetService.getNowPlayingData(spotifyAccountId)
            c.header('Cache-Control', 'no-cache, max-age=0')
            c.header('Access-Control-Allow-Origin', '*')
            return c.json(successResponse(data))
        }),
    )

    return route
}
