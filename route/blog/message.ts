import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { messageListQuerySchema, messageCreateSchema } from '../../dto/blog/message'
import type { MessageService } from '../../service/domain/blog/message'

type MessageRouteDeps = {
    messageService: MessageService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

export const createMessageRoute = (deps: MessageRouteDeps) => {
    const route = new Hono()

    route.get(
        '/user/:userId',
        describeRoute({
            tags: ['Blog'],
            summary: '사용자별 메시지 조회',
            responses: { 200: { description: '메시지 목록' } },
        }),
        withErrorHandling(async (c) => {
            const userId = c.req.param('userId')
            const page = Number(c.req.query('page') || '1')
            const size = Number(c.req.query('size') || '20')
            const result = await deps.messageService.list(userId, page, size)
            return c.json(successResponse(result))
        }),
    )

    route.get(
        '/user/:userId/profile',
        describeRoute({
            tags: ['Blog'],
            summary: '사용자 프로필 조회',
            responses: {
                200: { description: '사용자 프로필' },
                ...errorResponses(['NOT_FOUND']),
            },
        }),
        withErrorHandling(async (c) => {
            const userId = c.req.param('userId')
            const profile = await deps.messageService.getUserProfile(userId)
            if (!profile) throw createAppError('NOT_FOUND')
            return c.json(successResponse(profile))
        }),
    )

    route.post(
        '/',
        describeRoute({
            tags: ['Blog'],
            summary: '메시지 작성',
            responses: {
                200: { description: '생성된 메시지' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        validator('json', messageCreateSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            if (session.user.role !== 'admin') throw createAppError('FORBIDDEN')

            const input = c.req.valid('json' as never) as z.infer<typeof messageCreateSchema>
            const result = await deps.messageService.create(session.user.id, input)
            return c.json(successResponse(result))
        }),
    )

    route.delete(
        '/:id',
        describeRoute({
            tags: ['Blog'],
            summary: '메시지 삭제',
            responses: {
                200: { description: '삭제 결과' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            if (session.user.role !== 'admin') throw createAppError('FORBIDDEN')

            const messageId = c.req.param('id')
            const result = await deps.messageService.delete(messageId, session.user.id)
            if (!result.success) throw createAppError('NOT_FOUND')

            return c.json(successResponse({ success: true, id: messageId }))
        }),
    )

    return route
}
