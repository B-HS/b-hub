import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { webhookCreateSchema, webhookDeleteByUrlSchema } from '../../dto/hn/webhook'
import type { HnWebhookService } from '../../service/domain/hn/hn-webhook'

type WebhookRouteDeps = {
    webhookService: HnWebhookService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

export const createWebhookRoute = (deps: WebhookRouteDeps) => {
    const route = new Hono()

    const requireAdmin = async (c: { req: { raw: { headers: Headers } } }) => {
        const session = await deps.getSession(c)
        if (!session) throw createAppError('UNAUTHORIZED')
        if (session.user.role !== 'admin') throw createAppError('FORBIDDEN')
        return session
    }

    route.post(
        '/',
        describeRoute({
            tags: ['HN Webhook'],
            summary: '웹훅 등록',
            responses: {
                200: { description: '등록 완료' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN', 'HN_WEBHOOK_REGISTER_FAILED']),
            },
        }),
        validator('json', webhookCreateSchema),
        withErrorHandling(async (c) => {
            await requireAdmin(c)
            const body = c.req.valid('json' as never) as z.infer<typeof webhookCreateSchema>
            const result = await deps.webhookService.register(body.url, undefined, 'discord', body.digestTypes)

            if (!result.success) {
                throw createAppError('HN_WEBHOOK_REGISTER_FAILED', {
                    detail: result.error,
                })
            }

            return c.json(successResponse({ registered: true }))
        }),
    )

    route.delete(
        '/:id',
        describeRoute({
            tags: ['HN Webhook'],
            summary: '웹훅 삭제',
            responses: {
                200: { description: '삭제 완료' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        withErrorHandling(async (c) => {
            await requireAdmin(c)
            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('VALIDATION_ERROR')

            await deps.webhookService.remove(id)
            return c.json(successResponse({ deleted: true }))
        }),
    )

    route.post(
        '/delete-by-url',
        describeRoute({
            tags: ['HN Webhook'],
            summary: 'URL로 웹훅 삭제',
            responses: {
                200: { description: '삭제 완료' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        validator('json', webhookDeleteByUrlSchema),
        withErrorHandling(async (c) => {
            await requireAdmin(c)
            const body = c.req.valid('json' as never) as z.infer<typeof webhookDeleteByUrlSchema>
            const result = await deps.webhookService.removeByUrl(body.url)
            return c.json(successResponse(result))
        }),
    )

    route.patch(
        '/:id/deactivate',
        describeRoute({
            tags: ['HN Webhook'],
            summary: '웹훅 비활성화',
            responses: {
                200: { description: '비활성화 완료' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        withErrorHandling(async (c) => {
            await requireAdmin(c)
            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('VALIDATION_ERROR')

            await deps.webhookService.deactivate(id)
            return c.json(successResponse({ deactivated: true }))
        }),
    )

    route.post(
        '/public/register',
        describeRoute({
            tags: ['HN Webhook'],
            summary: '공개 웹훅 등록',
            responses: {
                200: { description: '등록 완료' },
                ...errorResponses(['HN_WEBHOOK_REGISTER_FAILED']),
            },
        }),
        validator('json', webhookCreateSchema),
        withErrorHandling(async (c) => {
            const body = c.req.valid('json' as never) as z.infer<typeof webhookCreateSchema>
            const result = await deps.webhookService.register(body.url, undefined, 'discord', body.digestTypes)

            if (!result.success) {
                throw createAppError('HN_WEBHOOK_REGISTER_FAILED', {
                    detail: result.error,
                })
            }

            return c.json(successResponse({ registered: true }))
        }),
    )

    route.post(
        '/public/unregister',
        describeRoute({
            tags: ['HN Webhook'],
            summary: '공개 웹훅 해제',
            responses: {
                200: { description: '해제 완료' },
            },
        }),
        validator('json', webhookDeleteByUrlSchema),
        withErrorHandling(async (c) => {
            const body = c.req.valid('json' as never) as z.infer<typeof webhookDeleteByUrlSchema>
            const result = await deps.webhookService.removeByUrl(body.url)
            return c.json(successResponse(result))
        }),
    )

    route.post(
        '/:id/test',
        describeRoute({
            tags: ['HN Webhook'],
            summary: '웹훅 테스트',
            responses: {
                200: { description: '테스트 결과' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        withErrorHandling(async (c) => {
            await requireAdmin(c)
            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('VALIDATION_ERROR')

            const result = await deps.webhookService.test(id)
            return c.json(successResponse(result))
        }),
    )

    return route
}
