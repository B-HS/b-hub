import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { withErrorHandling } from '../lib/with-error-handling'
import { createAppError } from '../lib/error'
import { badgeImageQuerySchema, badgeFontsResponseSchema } from '../dto/badge'
import { errorResponses } from '../dto/error-response'
import type { Context } from 'hono'
import type { BadgeService } from '../service/domain/badge/badge'

type RateLimitResult = { allowed: boolean; limit: number; remaining: number; resetAt: number }

type BadgeRouteDeps = {
    badgeService: BadgeService
    checkLimit?: (key: string, path: string) => RateLimitResult
}

const BADGE_IMAGE_RATE_LIMIT_PATH = 'badge:image'
const UNKNOWN_CLIENT_IP = 'unknown'

const getClientIp = (c: Context) => {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded) return forwarded
    return c.req.header('x-real-ip') ?? UNKNOWN_CLIENT_IP
}

const applyRateLimitHeaders = (c: Context, result: RateLimitResult) => {
    const headers = {
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.resetAt),
    }
    for (const [key, value] of Object.entries(headers)) c.header(key, value)
    return headers
}

const badgeImageResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        local: z.array(z.object({ name: z.string(), weights: z.array(z.number()) })),
        googleFontsSupported: z.boolean(),
    }),
})

export const createBadgeRoute = (deps: BadgeRouteDeps) => {
    const route = new Hono()

    route.get(
        '/image',
        describeRoute({
            tags: ['Badge'],
            summary: '뱃지 이미지 생성',
            responses: {
                200: {
                    description: 'PNG 이미지',
                    content: {
                        'image/png': { schema: { type: 'string', format: 'binary' } },
                    },
                },
                ...errorResponses(['IMAGE_GENERATE_FAILED', 'RATE_LIMIT_EXCEEDED']),
            },
        }),
        validator('query', badgeImageQuerySchema),
        withErrorHandling(async (c) => {
            const rateLimit = deps.checkLimit?.(getClientIp(c), BADGE_IMAGE_RATE_LIMIT_PATH)
            const rateLimitHeaders = rateLimit ? applyRateLimitHeaders(c, rateLimit) : {}
            if (rateLimit && !rateLimit.allowed) throw createAppError('RATE_LIMIT_EXCEEDED')

            const query = c.req.valid('query' as never) as z.infer<typeof badgeImageQuerySchema>

            const ALLOWED_CSS_PROPERTIES = new Set([
                'color',
                'backgroundColor',
                'fontSize',
                'fontWeight',
                'fontFamily',
                'padding',
                'paddingTop',
                'paddingRight',
                'paddingBottom',
                'paddingLeft',
                'margin',
                'marginTop',
                'marginRight',
                'marginBottom',
                'marginLeft',
                'borderRadius',
                'border',
                'borderColor',
                'borderWidth',
                'textAlign',
                'letterSpacing',
                'lineHeight',
                'opacity',
                'gap',
                'display',
                'alignItems',
                'justifyContent',
                'width',
                'height',
                'maxWidth',
                'maxHeight',
            ])

            const css = (() => {
                try {
                    const parsed = JSON.parse(query.css) as Record<string, string | number>
                    const sanitized: Record<string, string | number> = {}
                    for (const [key, value] of Object.entries(parsed)) {
                        if (ALLOWED_CSS_PROPERTIES.has(key) && (typeof value === 'string' || typeof value === 'number')) {
                            sanitized[key] = value
                        }
                    }
                    return sanitized
                } catch {
                    return {} as Record<string, string | number>
                }
            })()

            const result = await deps.badgeService.generate({
                width: query.width,
                height: query.height,
                text: query.text,
                font: query.font,
                fontSize: query.fontSize,
                fontWeight: query.fontWeight,
                color: query.color,
                backgroundColor: query.backgroundColor,
                icon: query.icon,
                iconUrl: query.iconUrl,
                iconSize: query.iconSize,
                tailwind: query.tailwind,
                css,
            })

            return new Response(new Uint8Array(result.buffer), {
                status: 200,
                headers: {
                    'Content-Type': 'image/png',
                    'X-Cache': result.cacheHit ? 'HIT' : 'MISS',
                    'Cache-Control': 'public, max-age=31536000, immutable',
                    ...rateLimitHeaders,
                },
            })
        }),
    )

    route.get(
        '/fonts',
        describeRoute({
            tags: ['Badge'],
            summary: '사용 가능한 폰트 목록',
            responses: {
                200: {
                    description: '폰트 목록',
                    content: {
                        'application/json': { schema: resolver(badgeFontsResponseSchema) },
                    },
                },
            },
        }),
        withErrorHandling(async (c) => {
            const fonts = deps.badgeService.getAvailableFonts()
            return c.json(fonts)
        }),
    )

    return route
}
