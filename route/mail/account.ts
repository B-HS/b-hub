import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { resolver, validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { withAuth } from '../../lib/with-auth'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { mailAccountCreateSchema, mailAccountUpdateSchema, mailAccountResponseSchema, mailAccountParamSchema } from '../../dto/mail/account'
import type { MailAccountService } from '../../service/domain/mail/mail-account'
import type { AuthContext } from '../../lib/hono-types'

type MailAccountRouteDeps = {
    mailAccountService: MailAccountService
    getSession: Parameters<typeof withAuth>[0]['getSession']
}

const formatAccount = (a: { id: number; provider: string; email: string; displayName: string | null; isActive: boolean; lastSyncAt: Date | null; lastSyncStatus: string | null; createdAt: Date; updatedAt: Date }) => ({
    id: a.id,
    provider: a.provider,
    email: a.email,
    displayName: a.displayName,
    isActive: a.isActive,
    lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: a.lastSyncStatus,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
})

export const createMailAccountRoute = (deps: MailAccountRouteDeps) => {
    const route = new Hono<AuthContext>()

    route.get(
        '/',
        describeRoute({
            tags: ['Mail'],
            summary: '메일 계정 목록 조회',
            responses: {
                200: {
                    description: '계정 목록',
                    content: { 'application/json': { schema: resolver(z.object({ success: z.literal(true), data: z.array(mailAccountResponseSchema) })) } },
                },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const accounts = await deps.mailAccountService.list(user.id)
                return c.json(successResponse(accounts.map(formatAccount)))
            }),
        ),
    )

    route.get(
        '/:accountId',
        describeRoute({
            tags: ['Mail'],
            summary: '메일 계정 상세 조회',
            responses: {
                200: {
                    description: '계정 상세',
                    content: { 'application/json': { schema: resolver(z.object({ success: z.literal(true), data: mailAccountResponseSchema })) } },
                },
                ...errorResponses(['UNAUTHORIZED', 'MAIL_ACCOUNT_NOT_FOUND']),
            },
        }),
        validator('param', mailAccountParamSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const { accountId } = c.req.valid('param' as never) as z.infer<typeof mailAccountParamSchema>
                const account = await deps.mailAccountService.getById(accountId, user.id)
                return c.json(successResponse(formatAccount(account)))
            }),
        ),
    )

    route.post(
        '/',
        describeRoute({
            tags: ['Mail'],
            summary: '메일 계정 연결',
            responses: {
                200: { description: '생성된 계정 ID' },
                ...errorResponses(['UNAUTHORIZED', 'MAIL_ACCOUNT_LIMIT_EXCEEDED', 'MAIL_CREDENTIALS_INVALID']),
            },
        }),
        validator('json', mailAccountCreateSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const body = c.req.valid('json' as never) as z.infer<typeof mailAccountCreateSchema>
                const result = await deps.mailAccountService.create(user.id, body)
                return c.json(successResponse(result))
            }),
        ),
    )

    route.patch(
        '/:accountId',
        describeRoute({
            tags: ['Mail'],
            summary: '메일 계정 수정',
            responses: {
                200: { description: '수정 완료' },
                ...errorResponses(['UNAUTHORIZED', 'MAIL_ACCOUNT_NOT_FOUND']),
            },
        }),
        validator('param', mailAccountParamSchema),
        validator('json', mailAccountUpdateSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const { accountId } = c.req.valid('param' as never) as z.infer<typeof mailAccountParamSchema>
                const body = c.req.valid('json' as never) as z.infer<typeof mailAccountUpdateSchema>
                await deps.mailAccountService.update(accountId, user.id, body)
                return c.json(successResponse({ updated: true }))
            }),
        ),
    )

    route.delete(
        '/:accountId',
        describeRoute({
            tags: ['Mail'],
            summary: '메일 계정 삭제',
            responses: {
                200: { description: '삭제 완료' },
                ...errorResponses(['UNAUTHORIZED', 'MAIL_ACCOUNT_NOT_FOUND']),
            },
        }),
        validator('param', mailAccountParamSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const { accountId } = c.req.valid('param' as never) as z.infer<typeof mailAccountParamSchema>
                await deps.mailAccountService.remove(accountId, user.id)
                return c.json(successResponse({ deleted: true }))
            }),
        ),
    )

    route.post(
        '/:accountId/test',
        describeRoute({
            tags: ['Mail'],
            summary: '메일 연결 테스트',
            responses: {
                200: { description: '연결 테스트 결과' },
                ...errorResponses(['UNAUTHORIZED', 'MAIL_ACCOUNT_NOT_FOUND', 'MAIL_CONNECTION_FAILED']),
            },
        }),
        validator('param', mailAccountParamSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const { accountId } = c.req.valid('param' as never) as z.infer<typeof mailAccountParamSchema>
                const result = await deps.mailAccountService.testConnection(accountId, user.id)
                return c.json(successResponse(result))
            }),
        ),
    )

    return route
}
