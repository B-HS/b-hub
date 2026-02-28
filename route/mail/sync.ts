import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { withAuth } from '../../lib/with-auth'
import { withRateLimit } from '../../lib/with-rate-limit'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { mailSyncTriggerSchema, mailHistoricalSyncSchema, mailSyncStatusQuerySchema } from '../../dto/mail/sync'
import type { MailSyncService } from '../../service/domain/mail/mail-sync'
import type { AuthContext } from '../../lib/hono-types'

type MailSyncRouteDeps = {
    mailSyncService: MailSyncService
    getSession: Parameters<typeof withAuth>[0]['getSession']
    checkLimit?: (key: string, path: string) => { allowed: boolean; limit: number; remaining: number; resetAt: number }
}

export const createMailSyncRoute = (deps: MailSyncRouteDeps) => {
    const route = new Hono<AuthContext>()

    route.post(
        '/',
        describeRoute({
            tags: ['Mail'],
            summary: 'Incremental 동기화',
            responses: {
                200: { description: '동기화 결과' },
                ...errorResponses(['UNAUTHORIZED', 'MAIL_ACCOUNT_NOT_FOUND', 'MAIL_PROVIDER_ERROR']),
            },
        }),
        validator('json', mailSyncTriggerSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(
                deps.checkLimit
                    ? withRateLimit({ checkLimit: deps.checkLimit })(async (c, user) => {
                        const body = c.req.valid('json' as never) as z.infer<typeof mailSyncTriggerSchema>
                        const result = await deps.mailSyncService.syncAccount(body.accountId, user.id, body.folderId)
                        return c.json(successResponse(result))
                    })
                    : async (c, user) => {
                        const body = c.req.valid('json' as never) as z.infer<typeof mailSyncTriggerSchema>
                        const result = await deps.mailSyncService.syncAccount(body.accountId, user.id, body.folderId)
                        return c.json(successResponse(result))
                    },
            ),
        ),
    )

    route.post(
        '/historical',
        describeRoute({
            tags: ['Mail'],
            summary: 'Historical 배치 동기화',
            responses: {
                200: { description: '배치 동기화 결과' },
                ...errorResponses(['UNAUTHORIZED', 'MAIL_ACCOUNT_NOT_FOUND', 'MAIL_PROVIDER_ERROR', 'MAIL_FOLDER_NOT_FOUND']),
            },
        }),
        validator('json', mailHistoricalSyncSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const body = c.req.valid('json' as never) as z.infer<typeof mailHistoricalSyncSchema>
                const result = await deps.mailSyncService.syncHistorical(body.accountId, user.id, body)
                return c.json(successResponse(result))
            }),
        ),
    )

    route.get(
        '/status',
        describeRoute({
            tags: ['Mail'],
            summary: '동기화 상태 조회',
            responses: {
                200: { description: '동기화 상태' },
                ...errorResponses(['UNAUTHORIZED', 'MAIL_ACCOUNT_NOT_FOUND']),
            },
        }),
        validator('query', mailSyncStatusQuerySchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const query = c.req.valid('query' as never) as z.infer<typeof mailSyncStatusQuerySchema>
                const status = await deps.mailSyncService.getSyncStatus(query.accountId, user.id)
                return c.json(successResponse(status))
            }),
        ),
    )

    return route
}
