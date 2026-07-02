import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { aiProviderCreateSchema, aiProviderUpdateSchema } from '../../dto/ai/provider'
import type { AiProvider } from '../../db/schema'
import type { AiConnectionService } from '../../service/domain/ai/ai-connection'

type AiConnectionRouteDeps = {
    aiConnectionService: AiConnectionService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

const toResponse = (row: AiProvider) => ({
    id: row.id,
    provider: row.provider,
    authType: row.authType,
    status: row.status,
    statusDetail: row.statusDetail,
    displayName: row.displayName,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    lastRefreshedAt: row.lastRefreshedAt?.toISOString() ?? null,
    modelsFetchedAt: row.modelsFetchedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
})

export const createAiConnectionRoute = (deps: AiConnectionRouteDeps) => {
    const route = new Hono()

    route.get(
        '/',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 프로바이더 연결 목록',
            responses: { 200: { description: '연결 목록' }, ...errorResponses(['UNAUTHORIZED']) },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const rows = await deps.aiConnectionService.list(session.user.id)
            return c.json(successResponse(rows.map(toResponse)))
        }),
    )

    route.post(
        '/',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 프로바이더 연결(등록·재인증) — 등록 전 자격증명 검증',
            responses: { 200: { description: '연결 결과' }, ...errorResponses(['UNAUTHORIZED', 'AI_CREDENTIALS_INVALID', 'AI_REAUTH_REQUIRED']) },
        }),
        validator('json', aiProviderCreateSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const input = c.req.valid('json' as never) as z.infer<typeof aiProviderCreateSchema>
            const row = await deps.aiConnectionService.connect(session.user.id, input)
            return c.json(successResponse(toResponse(row)))
        }),
    )

    route.patch(
        '/:providerId',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 프로바이더 연결 수정',
            responses: { 200: { description: '수정 결과' }, ...errorResponses(['UNAUTHORIZED', 'AI_PROVIDER_NOT_FOUND']) },
        }),
        validator('json', aiProviderUpdateSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const providerId = Number(c.req.param('providerId'))
            if (isNaN(providerId)) throw createAppError('AI_PROVIDER_NOT_FOUND')
            const input = c.req.valid('json' as never) as z.infer<typeof aiProviderUpdateSchema>
            const row = await deps.aiConnectionService.update(session.user.id, providerId, input)
            return c.json(successResponse(toResponse(row)))
        }),
    )

    route.delete(
        '/:providerId',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 프로바이더 연결 삭제',
            responses: { 200: { description: '삭제 완료' }, ...errorResponses(['UNAUTHORIZED', 'AI_PROVIDER_NOT_FOUND']) },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const providerId = Number(c.req.param('providerId'))
            if (isNaN(providerId)) throw createAppError('AI_PROVIDER_NOT_FOUND')
            await deps.aiConnectionService.remove(session.user.id, providerId)
            return c.json(successResponse({ deleted: true }))
        }),
    )

    return route
}
