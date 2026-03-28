import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { resolver, validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../lib/with-error-handling'
import { badgeImageQuerySchema, badgeFontsResponseSchema } from '../dto/badge'
import { errorResponses } from '../dto/error-response'
import type { BadgeService } from '../service/domain/badge/badge'

type BadgeRouteDeps = {
    badgeService: BadgeService
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
                ...errorResponses(['IMAGE_GENERATE_FAILED']),
            },
        }),
        validator('query', badgeImageQuerySchema),
        withErrorHandling(async (c) => {
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
