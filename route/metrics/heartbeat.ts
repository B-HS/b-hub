import { Hono } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { verifyCronAuth } from '../../lib/cron-auth'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import type { MetricsLogService } from '../../service/domain/metrics/log'

type MetricsHeartbeatRouteDeps = {
    metricsLogService: MetricsLogService
    cronSecret: string
}

export const createMetricsHeartbeatRoute = (deps: MetricsHeartbeatRouteDeps) => {
    const route = new Hono()

    route.on(
        ['GET', 'POST'],
        '/heartbeat-check',
        describeRoute({
            tags: ['Metrics'],
            summary: '디바이스 다운/복구 감지 (Cron)',
            responses: {
                200: {
                    description: '감지 결과',
                    content: {
                        'application/json': {
                            schema: resolver(
                                z.object({ success: z.literal(true), data: z.object({ down: z.array(z.string()), recovered: z.array(z.string()) }) }),
                            ),
                        },
                    },
                },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        withErrorHandling(async (c) => {
            verifyCronAuth(c, deps.cronSecret)
            const result = await deps.metricsLogService.checkHeartbeats()
            return c.json(successResponse(result))
        }),
    )

    return route
}
