import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { withAuth } from '../../lib/with-auth'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { createAppError } from '../../lib/error'
import { mailAccountCreateSchema, mailAccountUpdateSchema, mailAccountResponseSchema, mailAccountParamSchema } from '../../dto/mail/account'
import type { MailAccountService } from '../../service/domain/mail/mail-account'
import type { MailOAuthConnectService } from '../../service/domain/mail/mail-oauth-connect'
import type { AuthContext } from '../../lib/hono-types'
import { isAllowedRedirect } from '../../lib/url-validator'

type MailAccountRouteDeps = {
    mailAccountService: MailAccountService
    getSession: Parameters<typeof withAuth>[0]['getSession']
    mailOAuthConnect?: MailOAuthConnectService
    baseUrl?: string
}

const formatAccount = (a: {
    id: number
    provider: string
    email: string
    displayName: string | null
    isActive: boolean
    lastSyncAt: Date | null
    lastSyncStatus: string | null
    createdAt: Date
    updatedAt: Date
}) => ({
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
                    content: {
                        'application/json': { schema: resolver(z.object({ success: z.literal(true), data: z.array(mailAccountResponseSchema) })) },
                    },
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

    route.get(
        '/connect/google',
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                if (!deps.mailOAuthConnect || deps.baseUrl === undefined) {
                    throw createAppError('SERVICE_NOT_CONFIGURED')
                }
                const redirect = c.req.query('redirect') || undefined
                const authUrl = await deps.mailOAuthConnect.generateAuthUrl(user.id, deps.baseUrl, redirect)
                return c.redirect(authUrl, 302)
            }),
        ),
    )

    route.get(
        '/connect/google/callback',
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                if (!deps.mailOAuthConnect || deps.baseUrl === undefined) {
                    throw createAppError('SERVICE_NOT_CONFIGURED')
                }

                const code = c.req.query('code')
                const state = c.req.query('state')
                const errorParam = c.req.query('error')

                if (errorParam || !code || !state) {
                    const redirect = state ? deps.mailOAuthConnect.parseRedirectFromState(state) : null
                    const target = redirect && isAllowedRedirect(redirect) ? redirect : deps.baseUrl
                    return c.redirect(`${target}?error=oauth_denied`, 302)
                }

                try {
                    const result = await deps.mailOAuthConnect.handleCallback(code, state, user.id, deps.baseUrl)
                    const target = result.redirect && isAllowedRedirect(result.redirect) ? result.redirect : deps.baseUrl
                    return c.redirect(`${target}?success=true&email=${encodeURIComponent(result.email)}`, 302)
                } catch (err) {
                    const redirect = deps.mailOAuthConnect.parseRedirectFromState(state)
                    const target = redirect && isAllowedRedirect(redirect) ? redirect : deps.baseUrl
                    const errorCode = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : 'unknown'
                    return c.redirect(`${target}?error=${errorCode}`, 302)
                }
            }),
        ),
    )

    return route
}
