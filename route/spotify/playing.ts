import { Hono } from 'hono'
import { withErrorHandling } from '../../lib/with-error-handling'
import { successResponse } from '../../lib/api-response'
import { createAppError } from '../../lib/error'
import { DEFAULT_THEME } from '../../service/domain/spotify/spotify-widget'
import type { SpotifyWidgetTokenService } from '../../service/domain/spotify/spotify-widget-token'
import type { SpotifyWidgetService } from '../../service/domain/spotify/spotify-widget'
import type { WidgetTheme } from '../../service/domain/spotify/spotify-widget'
import type { Context } from 'hono'

type RateLimitResult = { allowed: boolean; limit: number; remaining: number; resetAt: number }

type SpotifyPlayingRouteDeps = {
    spotifyWidgetTokenService: SpotifyWidgetTokenService
    spotifyWidgetService: SpotifyWidgetService
    baseUrl: string
    checkLimit?: (key: string, path: string) => RateLimitResult
}

const HEX_COLOR_RE = /^[0-9a-fA-F]{3,8}$/

const SPOTIFY_PLAYING_RATE_LIMIT_PATH = 'spotify:playing'
const UNKNOWN_CLIENT_IP = 'unknown'

const getClientIp = (c: Context) => {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded) return forwarded
    return c.req.header('x-real-ip') ?? UNKNOWN_CLIENT_IP
}

const enforceRateLimit = (c: Context, token: string, checkLimit?: SpotifyPlayingRouteDeps['checkLimit']) => {
    if (!checkLimit) return
    const result = checkLimit(`${token}:${getClientIp(c)}`, SPOTIFY_PLAYING_RATE_LIMIT_PATH)
    c.header('X-RateLimit-Limit', String(result.limit))
    c.header('X-RateLimit-Remaining', String(result.remaining))
    c.header('X-RateLimit-Reset', String(result.resetAt))
    if (!result.allowed) throw createAppError('RATE_LIMIT_EXCEEDED')
}

const parseTheme = (c: Context): WidgetTheme => {
    const q = (key: string) => c.req.query(key)
    const hex = (val: string | undefined, fallback: string) => (val && HEX_COLOR_RE.test(val) ? val : fallback)
    const num = (val: string | undefined, fallback: number, min: number, max: number) => {
        const n = val ? parseInt(val, 10) : NaN
        return Number.isFinite(n) && n >= min && n <= max ? n : fallback
    }

    return {
        radius: num(q('radius'), DEFAULT_THEME.radius, 0, 50),
        bg: hex(q('bg'), DEFAULT_THEME.bg),
        color: hex(q('color'), DEFAULT_THEME.color),
        secondary: hex(q('secondary'), DEFAULT_THEME.secondary),
        accent: hex(q('accent'), DEFAULT_THEME.accent),
    }
}

export const createSpotifyPlayingRoute = (deps: SpotifyPlayingRouteDeps) => {
    const route = new Hono()

    route.get(
        '/:token',
        withErrorHandling(async (c) => {
            const token = c.req.param('token')!
            enforceRateLimit(c, token, deps.checkLimit)
            const { spotifyAccountId } = await deps.spotifyWidgetTokenService.validate(token)
            const theme = parseTheme(c)
            const svg = await deps.spotifyWidgetService.generateSvg(spotifyAccountId, theme)
            c.header('Content-Type', 'image/svg+xml')
            c.header('Cache-Control', 'no-cache, max-age=0, no-store, must-revalidate')
            return c.body(svg)
        }),
    )

    route.get(
        '/:token/widget',
        withErrorHandling(async (c) => {
            const token = c.req.param('token')!
            enforceRateLimit(c, token, deps.checkLimit)
            await deps.spotifyWidgetTokenService.validate(token)
            const theme = parseTheme(c)
            const html = deps.spotifyWidgetService.generateHtmlWidget(token, deps.baseUrl, theme)
            c.header('Content-Type', 'text/html; charset=utf-8')
            c.header('Cache-Control', 'no-cache, max-age=0')
            return c.body(html)
        }),
    )

    route.get(
        '/:token/data',
        withErrorHandling(async (c) => {
            const token = c.req.param('token')!
            enforceRateLimit(c, token, deps.checkLimit)
            const { spotifyAccountId } = await deps.spotifyWidgetTokenService.validate(token)
            const data = await deps.spotifyWidgetService.getNowPlayingData(spotifyAccountId)
            c.header('Cache-Control', 'no-cache, max-age=0')
            c.header('Access-Control-Allow-Origin', '*')
            return c.json(successResponse(data))
        }),
    )

    return route
}
