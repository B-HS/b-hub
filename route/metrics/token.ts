import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { createAppError } from '../../lib/error'
import { requireMetricsToken } from '../../middleware/require-metrics-token'
import { METRICS_TOKEN_SCOPE, metricsTokenCreateSchema, metricsTokenResponseSchema } from '../../dto/metrics/token'
import type { MetricsTokenService } from '../../service/domain/metrics/token'
import type { AuthContext } from '../../lib/hono-types'

type MetricsTokenRouteDeps = {
    metricsTokenService: MetricsTokenService
}

export const createMetricsTokenRoute = (deps: MetricsTokenRouteDeps) => {
    const route = new Hono<AuthContext>()

    route.get(
        '/',
        describeRoute({
            tags: ['Metrics'],
            summary: 'metrics 토큰 목록 조회 (Admin Token)',
            responses: {
                200: {
                    description: '토큰 목록',
                    content: {
                        'application/json': { schema: resolver(z.object({ success: z.literal(true), data: z.array(metricsTokenResponseSchema) })) },
                    },
                },
                ...errorResponses(['METRICS_TOKEN_INVALID', 'METRICS_TOKEN_FORBIDDEN']),
            },
        }),
        requireMetricsToken({ metricsTokenService: deps.metricsTokenService, scope: METRICS_TOKEN_SCOPE.ADMIN }),
        withErrorHandling(async (c) => {
            const tokens = await deps.metricsTokenService.listAll()
            const data = tokens.map((t) => ({
                id: t.id,
                alias: t.alias,
                scope: t.scope,
                dailyLimit: t.dailyLimit,
                expiresAt: t.expiresAt?.toISOString() ?? null,
                lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
                revokedAt: t.revokedAt?.toISOString() ?? null,
                createdAt: t.createdAt.toISOString(),
            }))
            return c.json(successResponse(data))
        }),
    )

    route.post(
        '/',
        describeRoute({
            tags: ['Metrics'],
            summary: 'metrics 토큰 발급 (Admin Token, 평문 1회 표시)',
            responses: {
                200: {
                    description: '발급된 토큰',
                    content: {
                        'application/json': {
                            schema: resolver(z.object({ success: z.literal(true), data: z.object({ id: z.number(), token: z.string() }) })),
                        },
                    },
                },
                ...errorResponses(['METRICS_TOKEN_INVALID', 'METRICS_TOKEN_FORBIDDEN', 'VALIDATION_ERROR']),
            },
        }),
        requireMetricsToken({ metricsTokenService: deps.metricsTokenService, scope: METRICS_TOKEN_SCOPE.ADMIN }),
        validator('json', metricsTokenCreateSchema),
        withErrorHandling(async (c) => {
            const body = c.req.valid('json' as never) as z.infer<typeof metricsTokenCreateSchema>
            const { id, token } = await deps.metricsTokenService.create(body)
            return c.json(successResponse({ id, token }))
        }),
    )

    route.delete(
        '/:id',
        describeRoute({
            tags: ['Metrics'],
            summary: 'metrics 토큰 폐기 (Admin Token)',
            responses: {
                200: { description: '폐기 완료' },
                ...errorResponses(['METRICS_TOKEN_INVALID', 'METRICS_TOKEN_FORBIDDEN', 'METRICS_TOKEN_NOT_FOUND', 'VALIDATION_ERROR']),
            },
        }),
        requireMetricsToken({ metricsTokenService: deps.metricsTokenService, scope: METRICS_TOKEN_SCOPE.ADMIN }),
        withErrorHandling(async (c) => {
            const id = parseInt(c.req.param('id')!, 10)
            if (isNaN(id)) throw createAppError('VALIDATION_ERROR')
            const revoked = await deps.metricsTokenService.revoke(id)
            if (!revoked) throw createAppError('METRICS_TOKEN_NOT_FOUND')
            return c.json(successResponse({ revoked: true }))
        }),
    )

    return route
}
