import { Hono } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { verifyCronAuth } from '../../lib/cron-auth'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import type { MetricsLogService } from '../../service/domain/metrics/log'

type MetricsArchiveRouteDeps = {
    metricsLogService: MetricsLogService
    cronSecret: string
}

export const createMetricsArchiveRoute = (deps: MetricsArchiveRouteDeps) => {
    const route = new Hono()

    route.on(
        ['GET', 'POST'],
        '/archive',
        describeRoute({
            tags: ['Metrics'],
            summary: '핫 보관 기간 경과 로그를 R2 로 아카이브 후 삭제 (Cron)',
            responses: {
                200: {
                    description: '아카이브 결과',
                    content: {
                        'application/json': {
                            schema: resolver(
                                z.object({
                                    success: z.literal(true),
                                    data: z.object({
                                        cutoff: z.string(),
                                        archived: z.array(z.object({ day: z.string(), count: z.number(), deleted: z.number() })),
                                        totalArchived: z.number(),
                                        totalDeleted: z.number(),
                                    }),
                                }),
                            ),
                        },
                    },
                },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        withErrorHandling(async (c) => {
            verifyCronAuth(c, deps.cronSecret)
            const result = await deps.metricsLogService.archiveOldLogs()
            return c.json(successResponse(result))
        }),
    )

    return route
}
