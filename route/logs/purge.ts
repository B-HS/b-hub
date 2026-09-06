import { Hono } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { verifyCronAuth } from '../../lib/cron-auth'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { getEnv } from '../../lib/env'
import type { LogEventService } from '../../service/domain/logs/log-event'

type LogPurgeRouteDeps = {
    logEventService: LogEventService
    cronSecret?: string
}

export const createLogPurgeRoute = (deps: LogPurgeRouteDeps) => {
    const route = new Hono()

    route.get(
        '/',
        describeRoute({
            tags: ['Logs'],
            summary: '보관기간 경과 로그·요청 이력 정리 (Cron)',
            responses: {
                200: {
                    description: '정리 결과',
                    content: {
                        'application/json': {
                            schema: resolver(
                                z.object({
                                    success: z.literal(true),
                                    data: z.object({
                                        infoDeleted: z.number(),
                                        warnDeleted: z.number(),
                                        errorDeleted: z.number(),
                                        weatherApiLogDeleted: z.number(),
                                        mailSyncLogDeleted: z.number(),
                                        mailSyncSessionDeleted: z.number(),
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
            verifyCronAuth(c, deps.cronSecret ?? getEnv().UPLOAD_SERVER_SECRET ?? '')
            const policy = await deps.logEventService.purgeByPolicy()
            const retention = await deps.logEventService.purgeRetention()
            return c.json(successResponse({ ...policy, ...retention }))
        }),
    )

    return route
}
