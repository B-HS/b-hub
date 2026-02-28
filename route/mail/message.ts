import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { withAuth } from '../../lib/with-auth'
import { withRateLimit } from '../../lib/with-rate-limit'
import { successResponse, paginatedResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import {
    mailMessageListQuerySchema,
    mailMessageSearchQuerySchema,
    mailThreadQuerySchema,
    mailMessageIdsSchema,
    mailMoveSchema,
    mailComposeSchema,
    mailReplySchema,
    mailForwardSchema,
    mailMessageParamSchema,
    mailSenderListQuerySchema,
} from '../../dto/mail/message'
import { mailAttachmentDownloadParamSchema } from '../../dto/mail/attachment'
import { sanitizeHeaderValue } from '../../lib/mail-utils'
import type { MailMessageService } from '../../service/domain/mail/mail-message'
import type { AuthContext } from '../../lib/hono-types'

type MailMessageRouteDeps = {
    mailMessageService: MailMessageService
    getSession: Parameters<typeof withAuth>[0]['getSession']
    checkLimit?: (key: string, path: string) => { allowed: boolean; limit: number; remaining: number; resetAt: number }
}

export const createMailMessageRoute = (deps: MailMessageRouteDeps) => {
    const route = new Hono<AuthContext>()

    route.get(
        '/',
        describeRoute({ tags: ['Mail'], summary: '메일 메시지 목록', responses: { 200: { description: '메시지 목록' }, ...errorResponses(['UNAUTHORIZED']) } }),
        validator('query', mailMessageListQuerySchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const query = c.req.valid('query' as never) as z.infer<typeof mailMessageListQuerySchema>
                const { data, total } = await deps.mailMessageService.list(user.id, query)
                return c.json(paginatedResponse(data, { page: query.page, limit: query.limit, total }))
            }),
        ),
    )

    route.get(
        '/search',
        describeRoute({ tags: ['Mail'], summary: '메일 검색', responses: { 200: { description: '검색 결과' }, ...errorResponses(['UNAUTHORIZED']) } }),
        validator('query', mailMessageSearchQuerySchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const query = c.req.valid('query' as never) as z.infer<typeof mailMessageSearchQuerySchema>
                const { data, total } = await deps.mailMessageService.search(user.id, query)
                return c.json(paginatedResponse(data, { page: query.page, limit: query.limit, total }))
            }),
        ),
    )

    route.get(
        '/thread',
        describeRoute({ tags: ['Mail'], summary: '스레드 조회', responses: { 200: { description: '스레드 메시지' }, ...errorResponses(['UNAUTHORIZED', 'MAIL_ACCOUNT_NOT_FOUND']) } }),
        validator('query', mailThreadQuerySchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const query = c.req.valid('query' as never) as z.infer<typeof mailThreadQuerySchema>
                const messages = await deps.mailMessageService.getThread(user.id, query.accountId, query.threadId)
                return c.json(successResponse(messages))
            }),
        ),
    )

    route.get(
        '/senders',
        describeRoute({ tags: ['Mail'], summary: '발신자 목록', responses: { 200: { description: '발신자 목록' }, ...errorResponses(['UNAUTHORIZED']) } }),
        validator('query', mailSenderListQuerySchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const query = c.req.valid('query' as never) as z.infer<typeof mailSenderListQuerySchema>
                const senders = await deps.mailMessageService.getSenderList(user.id, query)
                return c.json(successResponse(senders))
            }),
        ),
    )

    route.get(
        '/:messageId',
        describeRoute({ tags: ['Mail'], summary: '메일 메시지 상세', responses: { 200: { description: '메시지 상세' }, ...errorResponses(['UNAUTHORIZED', 'MAIL_MESSAGE_NOT_FOUND']) } }),
        validator('param', mailMessageParamSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const { messageId } = c.req.valid('param' as never) as z.infer<typeof mailMessageParamSchema>
                const message = await deps.mailMessageService.getById(user.id, messageId)
                return c.json(successResponse(message))
            }),
        ),
    )

    route.post(
        '/mark-read',
        describeRoute({ tags: ['Mail'], summary: '읽음 표시', responses: { 200: { description: '완료' }, ...errorResponses(['UNAUTHORIZED', 'MAIL_MESSAGE_NOT_FOUND']) } }),
        validator('json', mailMessageIdsSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const body = c.req.valid('json' as never) as z.infer<typeof mailMessageIdsSchema>
                await deps.mailMessageService.markRead(user.id, body.messageIds)
                return c.json(successResponse({ updated: true }))
            }),
        ),
    )

    route.post(
        '/mark-unread',
        describeRoute({ tags: ['Mail'], summary: '안읽음 표시', responses: { 200: { description: '완료' }, ...errorResponses(['UNAUTHORIZED', 'MAIL_MESSAGE_NOT_FOUND']) } }),
        validator('json', mailMessageIdsSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const body = c.req.valid('json' as never) as z.infer<typeof mailMessageIdsSchema>
                await deps.mailMessageService.markUnread(user.id, body.messageIds)
                return c.json(successResponse({ updated: true }))
            }),
        ),
    )

    route.post(
        '/star',
        describeRoute({ tags: ['Mail'], summary: '별표', responses: { 200: { description: '완료' }, ...errorResponses(['UNAUTHORIZED', 'MAIL_MESSAGE_NOT_FOUND']) } }),
        validator('json', mailMessageIdsSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const body = c.req.valid('json' as never) as z.infer<typeof mailMessageIdsSchema>
                await deps.mailMessageService.markStarred(user.id, body.messageIds)
                return c.json(successResponse({ updated: true }))
            }),
        ),
    )

    route.post(
        '/unstar',
        describeRoute({ tags: ['Mail'], summary: '별표 해제', responses: { 200: { description: '완료' }, ...errorResponses(['UNAUTHORIZED', 'MAIL_MESSAGE_NOT_FOUND']) } }),
        validator('json', mailMessageIdsSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const body = c.req.valid('json' as never) as z.infer<typeof mailMessageIdsSchema>
                await deps.mailMessageService.unmarkStarred(user.id, body.messageIds)
                return c.json(successResponse({ updated: true }))
            }),
        ),
    )

    route.post(
        '/move',
        describeRoute({ tags: ['Mail'], summary: '폴더 이동', responses: { 200: { description: '완료' }, ...errorResponses(['UNAUTHORIZED', 'MAIL_MESSAGE_NOT_FOUND']) } }),
        validator('json', mailMoveSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const body = c.req.valid('json' as never) as z.infer<typeof mailMoveSchema>
                await deps.mailMessageService.moveToFolder(user.id, body.messageIds, body.targetFolderId)
                return c.json(successResponse({ updated: true }))
            }),
        ),
    )

    route.post(
        '/delete',
        describeRoute({ tags: ['Mail'], summary: '삭제', responses: { 200: { description: '완료' }, ...errorResponses(['UNAUTHORIZED', 'MAIL_MESSAGE_NOT_FOUND']) } }),
        validator('json', mailMessageIdsSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const body = c.req.valid('json' as never) as z.infer<typeof mailMessageIdsSchema>
                await deps.mailMessageService.deleteMessages(user.id, body.messageIds)
                return c.json(successResponse({ deleted: true }))
            }),
        ),
    )

    route.post(
        '/send',
        describeRoute({ tags: ['Mail'], summary: '메일 발송', responses: { 200: { description: '발송 완료' }, ...errorResponses(['UNAUTHORIZED', 'MAIL_SEND_FAILED', 'RATE_LIMIT_EXCEEDED']) } }),
        validator('json', mailComposeSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(
                deps.checkLimit
                    ? withRateLimit({ checkLimit: deps.checkLimit })(async (c, user) => {
                        const body = c.req.valid('json' as never) as z.infer<typeof mailComposeSchema>
                        const result = await deps.mailMessageService.send(user.id, body.accountId, body)
                        return c.json(successResponse(result))
                    })
                    : async (c, user) => {
                        const body = c.req.valid('json' as never) as z.infer<typeof mailComposeSchema>
                        const result = await deps.mailMessageService.send(user.id, body.accountId, body)
                        return c.json(successResponse(result))
                    },
            ),
        ),
    )

    route.post(
        '/:messageId/reply',
        describeRoute({ tags: ['Mail'], summary: '답장', responses: { 200: { description: '발송 완료' }, ...errorResponses(['UNAUTHORIZED', 'MAIL_MESSAGE_NOT_FOUND', 'MAIL_SEND_FAILED']) } }),
        validator('param', mailMessageParamSchema),
        validator('json', mailReplySchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const { messageId } = c.req.valid('param' as never) as z.infer<typeof mailMessageParamSchema>
                const body = c.req.valid('json' as never) as z.infer<typeof mailReplySchema>
                const result = await deps.mailMessageService.reply(user.id, messageId, body)
                return c.json(successResponse(result))
            }),
        ),
    )

    route.post(
        '/:messageId/forward',
        describeRoute({ tags: ['Mail'], summary: '전달', responses: { 200: { description: '발송 완료' }, ...errorResponses(['UNAUTHORIZED', 'MAIL_MESSAGE_NOT_FOUND', 'MAIL_SEND_FAILED']) } }),
        validator('param', mailMessageParamSchema),
        validator('json', mailForwardSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const { messageId } = c.req.valid('param' as never) as z.infer<typeof mailMessageParamSchema>
                const body = c.req.valid('json' as never) as z.infer<typeof mailForwardSchema>
                const result = await deps.mailMessageService.forward(user.id, messageId, body)
                return c.json(successResponse(result))
            }),
        ),
    )

    route.get(
        '/:messageId/attachments/:attachmentId',
        describeRoute({ tags: ['Mail'], summary: '첨부파일 다운로드', responses: { 200: { description: '파일 바이너리' }, ...errorResponses(['UNAUTHORIZED', 'MAIL_ATTACHMENT_NOT_FOUND']) } }),
        validator('param', mailAttachmentDownloadParamSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const { messageId, attachmentId } = c.req.valid('param' as never) as z.infer<typeof mailAttachmentDownloadParamSchema>
                const data = await deps.mailMessageService.downloadAttachment(user.id, messageId, attachmentId)
                return new Response(new Uint8Array(data.content), {
                    headers: {
                        'Content-Type': sanitizeHeaderValue(data.mimeType),
                        'Content-Disposition': `attachment; filename="${encodeURIComponent(data.filename)}"`,
                        'Content-Length': data.content.length.toString(),
                    },
                })
            }),
        ),
    )

    return route
}
