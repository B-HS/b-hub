import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { resolver, validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { withAuth, withAdmin } from '../../lib/with-auth'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { createAppError } from '../../lib/error'
import { createWeatherKeyBodySchema, updateWeatherKeyLimitBodySchema, weatherKeyResponseSchema } from '../../dto/weather/weather-api-key'
import type { WeatherApiKeyService } from '../../service/domain/weather/weather-api-key'
import type { AuthContext } from '../../lib/hono-types'

type WeatherKeyRouteDeps = {
    weatherApiKeyService: WeatherApiKeyService
    getSession: Parameters<typeof withAuth>[0]['getSession']
}

export const createWeatherKeyRoute = (deps: WeatherKeyRouteDeps) => {
    const route = new Hono<AuthContext>()

    route.get(
        '/',
        describeRoute({
            tags: ['Weather'],
            summary: 'Weather API 키 목록 조회',
            responses: {
                200: {
                    description: '키 목록',
                    content: {
                        'application/json': {
                            schema: resolver(z.object({ success: z.literal(true), data: z.array(weatherKeyResponseSchema) })),
                        },
                    },
                },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const keys = await deps.weatherApiKeyService.listByUser(user.id)
                const data = keys.map((k) => ({
                    ...k,
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
            tags: ['Weather'],
            summary: 'Weather API 키 발급',
            responses: {
                200: {
                    description: '발급된 키 (1회만 표시)',
                    content: {
                        'application/json': {
                            schema: resolver(z.object({ success: z.literal(true), data: z.object({ key: z.string() }) })),
                        },
                    },
                },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        validator('json', createWeatherKeyBodySchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const body = c.req.valid('json' as never) as z.infer<typeof createWeatherKeyBodySchema>
                const key = await deps.weatherApiKeyService.create(user.id, body.name)
                return c.json(successResponse({ key }))
            }),
        ),
    )

    route.delete(
        '/:id',
        describeRoute({
            tags: ['Weather'],
            summary: 'Weather API 키 삭제',
            responses: {
                200: { description: '삭제 완료' },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const keyId = parseInt(c.req.param('id'), 10)
                if (isNaN(keyId)) throw createAppError('VALIDATION_ERROR')
                await deps.weatherApiKeyService.revoke(user.id, keyId)
                return c.json(successResponse({ deleted: true }))
            }),
        ),
    )

    route.patch(
        '/:id/limit',
        describeRoute({
            tags: ['Weather'],
            summary: 'Weather API 키 일일 한도 수정 (Admin)',
            responses: {
                200: { description: '수정 완료' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        validator('json', updateWeatherKeyLimitBodySchema),
        withErrorHandling(
            withAdmin({ getSession: deps.getSession })(async (c) => {
                const keyId = parseInt(c.req.param('id'), 10)
                if (isNaN(keyId)) throw createAppError('VALIDATION_ERROR')
                const body = c.req.valid('json' as never) as z.infer<typeof updateWeatherKeyLimitBodySchema>
                await deps.weatherApiKeyService.updateDailyLimit(keyId, body.dailyLimit)
                return c.json(successResponse({ updated: true }))
            }),
        ),
    )

    return route
}
