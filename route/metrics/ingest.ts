import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { createAppError } from '../../lib/error'
import { requireMetricsToken } from '../../middleware/require-metrics-token'
import { METRICS_BATCH_MAX, METRICS_PAYLOAD_MAX_BYTES, metricsIngestBatchSchema, metricsIngestSchema } from '../../dto/metrics/ingest'
import { METRICS_TOKEN_SCOPE } from '../../dto/metrics/token'
import type { Context } from 'hono'
import type { MetricsIngestInput } from '../../dto/metrics/ingest'
import type { MetricsLogService } from '../../service/domain/metrics/log'
import type { MetricsTokenService } from '../../service/domain/metrics/token'
import type { AuthContext } from '../../lib/hono-types'

type MetricsIngestRouteDeps = {
    metricsLogService: MetricsLogService
    metricsTokenService: MetricsTokenService
}

const assertPayloadSize = (event: MetricsIngestInput) => {
    if (Buffer.byteLength(JSON.stringify(event.payload)) > METRICS_PAYLOAD_MAX_BYTES) throw createAppError('METRICS_PAYLOAD_TOO_LARGE')
}

const readToken = (c: Context) => ({
    id: c.get('metricsTokenId' as never) as number,
    alias: c.get('metricsTokenAlias' as never) as string,
})

export const createMetricsIngestRoute = (deps: MetricsIngestRouteDeps) => {
    const route = new Hono<AuthContext>()

    route.post(
        '/',
        describeRoute({
            tags: ['Metrics'],
            summary: '시스템 정보 수집 (Token)',
            responses: {
                200: {
                    description: '수집 완료',
                    content: {
                        'application/json': { schema: resolver(z.object({ success: z.literal(true), data: z.object({ count: z.number() }) })) },
                    },
                },
                ...errorResponses(['METRICS_TOKEN_INVALID', 'METRICS_TOKEN_RATE_LIMIT', 'METRICS_PAYLOAD_TOO_LARGE', 'VALIDATION_ERROR']),
            },
        }),
        requireMetricsToken({ metricsTokenService: deps.metricsTokenService, scope: METRICS_TOKEN_SCOPE.CLIENT, checkRateLimit: true }),
        validator('json', metricsIngestSchema),
        withErrorHandling(async (c) => {
            const body = c.req.valid('json' as never) as z.infer<typeof metricsIngestSchema>
            assertPayloadSize(body)
            const count = await deps.metricsLogService.ingest(readToken(c), [body])
            return c.json(successResponse({ count }))
        }),
    )

    route.post(
        '/batch',
        describeRoute({
            tags: ['Metrics'],
            summary: '시스템 정보 배치 수집 (Token, 최대 50건)',
            responses: {
                200: {
                    description: '수집 완료',
                    content: {
                        'application/json': { schema: resolver(z.object({ success: z.literal(true), data: z.object({ count: z.number() }) })) },
                    },
                },
                ...errorResponses([
                    'METRICS_TOKEN_INVALID',
                    'METRICS_TOKEN_RATE_LIMIT',
                    'METRICS_BATCH_TOO_LARGE',
                    'METRICS_PAYLOAD_TOO_LARGE',
                    'VALIDATION_ERROR',
                ]),
            },
        }),
        requireMetricsToken({ metricsTokenService: deps.metricsTokenService, scope: METRICS_TOKEN_SCOPE.CLIENT, checkRateLimit: true }),
        validator('json', metricsIngestBatchSchema),
        withErrorHandling(async (c) => {
            const body = c.req.valid('json' as never) as z.infer<typeof metricsIngestBatchSchema>
            if (body.events.length > METRICS_BATCH_MAX) throw createAppError('METRICS_BATCH_TOO_LARGE')
            body.events.forEach(assertPayloadSize)
            const count = await deps.metricsLogService.ingest(readToken(c), body.events)
            return c.json(successResponse({ count }))
        }),
    )

    return route
}
