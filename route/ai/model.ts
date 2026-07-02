import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { aiProviderNameSchema } from '../../dto/ai/provider'
import type { AiModel } from '../../db/schema'
import type { AiModelService } from '../../service/domain/ai/ai-model'

type AiModelRouteDeps = {
    aiModelService: AiModelService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

const toResponse = (row: AiModel) => ({
    id: row.id,
    providerId: row.providerId,
    modelId: row.modelId,
    displayName: row.displayName,
    metadata: row.metadata,
    fetchedAt: row.fetchedAt.toISOString(),
})

const parseProvider = (raw: string) => {
    const parsed = aiProviderNameSchema.safeParse(raw)
    if (!parsed.success) throw createAppError('AI_PROVIDER_NOT_FOUND')
    return parsed.data
}

export const createAiModelRoute = (deps: AiModelRouteDeps) => {
    const route = new Hono()

    route.get(
        '/:provider/models',
        describeRoute({
            tags: ['AI'],
            summary: '캐시된 AI 모델 목록',
            responses: { 200: { description: '모델 목록' }, ...errorResponses(['UNAUTHORIZED', 'AI_PROVIDER_NOT_FOUND', 'AI_REAUTH_REQUIRED']) },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const provider = parseProvider(c.req.param('provider')!)
            const rows = await deps.aiModelService.listCached(session.user.id, provider)
            return c.json(successResponse(rows.map(toResponse)))
        }),
    )

    route.post(
        '/:provider/models/refresh',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 모델 목록 새로고침(프로바이더 fetch 후 저장)',
            responses: {
                200: { description: '새로고침된 모델 목록' },
                ...errorResponses(['UNAUTHORIZED', 'AI_PROVIDER_NOT_FOUND', 'AI_REAUTH_REQUIRED', 'AI_MODEL_FETCH_FAILED']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const provider = parseProvider(c.req.param('provider')!)
            const rows = await deps.aiModelService.refresh(session.user.id, provider)
            return c.json(successResponse(rows.map(toResponse)))
        }),
    )

    return route
}
