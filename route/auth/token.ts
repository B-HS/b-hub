import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { resolver } from 'hono-openapi/zod'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { withAuth } from '../../lib/with-auth'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import type { ApiTokenService } from '../../service/shared/api-token'
import type { AuthContext } from '../../lib/hono-types'

type TokenRouteDeps = {
    apiTokenService: ApiTokenService
    getSession: Parameters<typeof withAuth>[0]['getSession']
}

const createTokenBodySchema = z.object({
    name: z.string().min(1).max(100).optional(),
})

const tokenResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        token: z.string(),
    }),
})

const tokenListResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(
        z.object({
            id: z.number(),
            name: z.string().nullable(),
            createdAt: z.string(),
            lastUsedAt: z.string().nullable(),
        }),
    ),
})

const deleteTokenBodySchema = z.object({
    token: z.string().min(1),
})

export const createTokenRoute = (deps: TokenRouteDeps) => {
    const route = new Hono<AuthContext>()

    route.get(
        '/',
        describeRoute({
            tags: ['Auth'],
            summary: 'API 토큰 목록 조회',
            responses: {
                200: {
                    description: '토큰 목록',
                    content: {
                        'application/json': { schema: resolver(tokenListResponseSchema) },
                    },
                },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const tokens = await deps.apiTokenService.listByUser(user.id)
                const data = tokens.map((t) => ({
                    id: t.id,
                    name: t.name,
                    createdAt: t.createdAt.toISOString(),
                    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
                }))
                return c.json(successResponse(data))
            }),
        ),
    )

    route.post(
        '/',
        describeRoute({
            tags: ['Auth'],
            summary: 'API 토큰 발급',
            responses: {
                200: {
                    description: '발급된 토큰',
                    content: {
                        'application/json': { schema: resolver(tokenResponseSchema) },
                    },
                },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        validator('json', createTokenBodySchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const body = c.req.valid('json' as never) as z.infer<typeof createTokenBodySchema>
                const token = await deps.apiTokenService.create(user.id, body.name)
                return c.json(successResponse({ token }))
            }),
        ),
    )

    route.delete(
        '/',
        describeRoute({
            tags: ['Auth'],
            summary: 'API 토큰 삭제',
            responses: {
                200: { description: '삭제 완료' },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        validator('json', deleteTokenBodySchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const body = c.req.valid('json' as never) as z.infer<typeof deleteTokenBodySchema>
                await deps.apiTokenService.revoke(user.id, body.token)
                return c.json(successResponse({ deleted: true }))
            }),
        ),
    )

    return route
}
