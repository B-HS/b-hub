import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { withAuth } from '../../lib/with-auth'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { mailDraftCreateSchema, mailDraftUpdateSchema, mailDraftParamSchema, mailDraftResponseSchema } from '../../dto/mail/draft'
import type { MailDraftService } from '../../service/domain/mail/mail-draft'
import type { MailMessage } from '../../db/schema'
import type { AuthContext } from '../../lib/hono-types'

type MailDraftRouteDeps = {
    mailDraftService: MailDraftService
    getSession: Parameters<typeof withAuth>[0]['getSession']
}

const formatDraft = (m: MailMessage) => ({
    id: m.id,
    accountId: m.accountId,
    folderId: m.folderId,
    subject: m.subject,
    snippet: m.snippet,
    fromAddress: m.fromAddress,
    toAddresses: m.toAddresses ?? [],
    ccAddresses: m.ccAddresses ?? [],
    bccAddresses: m.bccAddresses ?? [],
    bodyHtml: m.bodyHtml,
    bodyText: m.bodyText,
    isRead: m.isRead,
    isStarred: m.isStarred,
    isDraft: m.isDraft,
    hasAttachments: m.hasAttachments,
    threadId: m.threadId,
    messageIdHeader: m.messageIdHeader,
    inReplyTo: m.inReplyTo,
    references: m.referencesHeader,
    sentAt: m.sentAt?.toISOString() ?? null,
    receivedAt: m.receivedAt?.toISOString() ?? null,
})

export const createMailDraftRoute = (deps: MailDraftRouteDeps) => {
    const route = new Hono<AuthContext>()

    route.post(
        '/',
        describeRoute({
            tags: ['Mail'],
            summary: '임시보관 메일 생성',
            responses: {
                200: {
                    description: '생성된 임시보관 메일',
                    content: { 'application/json': { schema: resolver(z.object({ success: z.literal(true), data: mailDraftResponseSchema })) } },
                },
                ...errorResponses(['UNAUTHORIZED', 'MAIL_ACCOUNT_NOT_FOUND', 'MAIL_MESSAGE_NOT_FOUND']),
            },
        }),
        validator('json', mailDraftCreateSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const body = c.req.valid('json' as never) as z.infer<typeof mailDraftCreateSchema>
                const draft = await deps.mailDraftService.createDraft(user.id, body)
                return c.json(successResponse(formatDraft(draft)))
            }),
        ),
    )

    route.put(
        '/:id',
        describeRoute({
            tags: ['Mail'],
            summary: '임시보관 메일 수정',
            responses: {
                200: {
                    description: '수정된 임시보관 메일',
                    content: { 'application/json': { schema: resolver(z.object({ success: z.literal(true), data: mailDraftResponseSchema })) } },
                },
                ...errorResponses(['UNAUTHORIZED', 'MAIL_MESSAGE_NOT_FOUND']),
            },
        }),
        validator('param', mailDraftParamSchema),
        validator('json', mailDraftUpdateSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const { id } = c.req.valid('param' as never) as z.infer<typeof mailDraftParamSchema>
                const body = c.req.valid('json' as never) as z.infer<typeof mailDraftUpdateSchema>
                const draft = await deps.mailDraftService.updateDraft(user.id, id, body)
                return c.json(successResponse(formatDraft(draft)))
            }),
        ),
    )

    route.delete(
        '/:id',
        describeRoute({
            tags: ['Mail'],
            summary: '임시보관 메일 삭제',
            responses: { 200: { description: '삭제 완료' }, ...errorResponses(['UNAUTHORIZED', 'MAIL_MESSAGE_NOT_FOUND']) },
        }),
        validator('param', mailDraftParamSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const { id } = c.req.valid('param' as never) as z.infer<typeof mailDraftParamSchema>
                const result = await deps.mailDraftService.deleteDraft(user.id, id)
                return c.json(successResponse(result))
            }),
        ),
    )

    return route
}
