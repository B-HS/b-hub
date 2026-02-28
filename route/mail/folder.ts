import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { resolver, validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { withAuth } from '../../lib/with-auth'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { mailFolderListQuerySchema, mailFolderResponseSchema } from '../../dto/mail/folder'
import type { AuthContext } from '../../lib/hono-types'

type MailFolderDb = {
    getFoldersByAccount: (accountId: number) => Promise<{
        id: number
        accountId: number
        name: string
        type: string
        parentId: number | null
        messageCount: number
        unreadCount: number
    }[]>
}

type MailFolderRouteDeps = {
    db: MailFolderDb
    mailAccountService: { getById: (accountId: number, userId: string) => Promise<unknown> }
    getSession: Parameters<typeof withAuth>[0]['getSession']
}

export const createMailFolderRoute = (deps: MailFolderRouteDeps) => {
    const route = new Hono<AuthContext>()

    route.get(
        '/',
        describeRoute({
            tags: ['Mail'],
            summary: '메일 폴더 목록 조회',
            responses: {
                200: {
                    description: '폴더 목록',
                    content: { 'application/json': { schema: resolver(z.object({ success: z.literal(true), data: z.array(mailFolderResponseSchema) })) } },
                },
                ...errorResponses(['UNAUTHORIZED', 'MAIL_ACCOUNT_NOT_FOUND']),
            },
        }),
        validator('query', mailFolderListQuerySchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const query = c.req.valid('query' as never) as z.infer<typeof mailFolderListQuerySchema>
                await deps.mailAccountService.getById(query.accountId, user.id)
                const folders = await deps.db.getFoldersByAccount(query.accountId)
                return c.json(successResponse(folders))
            }),
        ),
    )

    return route
}
