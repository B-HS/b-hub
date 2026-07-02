import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { aiPromptCreateSchema, aiPromptUpdateSchema, aiPromptListQuerySchema } from '../../dto/ai/prompt'
import type { AiPrompt } from '../../db/schema'
import type { AiPromptService } from '../../service/domain/ai/ai-prompt'

type AiPromptRouteDeps = {
    aiPromptService: AiPromptService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

const toResponse = (row: AiPrompt) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    stage: row.stage,
    content: row.content,
    featureKey: row.featureKey,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
})

export const createAiPromptRoute = (deps: AiPromptRouteDeps) => {
    const route = new Hono()

    route.get(
        '/',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 프롬프트 템플릿 목록',
            responses: { 200: { description: '프롬프트 목록' }, ...errorResponses(['UNAUTHORIZED']) },
        }),
        validator('query', aiPromptListQuerySchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const query = c.req.valid('query' as never) as z.infer<typeof aiPromptListQuerySchema>
            const rows = await deps.aiPromptService.list(session.user.id, query)
            return c.json(successResponse(rows.map(toResponse)))
        }),
    )

    route.post(
        '/',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 프롬프트 템플릿 생성',
            responses: { 200: { description: '생성된 프롬프트' }, ...errorResponses(['UNAUTHORIZED']) },
        }),
        validator('json', aiPromptCreateSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const input = c.req.valid('json' as never) as z.infer<typeof aiPromptCreateSchema>
            const row = await deps.aiPromptService.create(session.user.id, input)
            return c.json(successResponse(toResponse(row)))
        }),
    )

    route.patch(
        '/:promptId',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 프롬프트 템플릿 수정',
            responses: { 200: { description: '수정된 프롬프트' }, ...errorResponses(['UNAUTHORIZED', 'AI_PROMPT_NOT_FOUND']) },
        }),
        validator('json', aiPromptUpdateSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const promptId = Number(c.req.param('promptId'))
            if (isNaN(promptId)) throw createAppError('AI_PROMPT_NOT_FOUND')
            const input = c.req.valid('json' as never) as z.infer<typeof aiPromptUpdateSchema>
            const row = await deps.aiPromptService.update(session.user.id, promptId, input)
            return c.json(successResponse(toResponse(row)))
        }),
    )

    route.delete(
        '/:promptId',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 프롬프트 템플릿 삭제',
            responses: { 200: { description: '삭제 완료' }, ...errorResponses(['UNAUTHORIZED', 'AI_PROMPT_NOT_FOUND']) },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const promptId = Number(c.req.param('promptId'))
            if (isNaN(promptId)) throw createAppError('AI_PROMPT_NOT_FOUND')
            await deps.aiPromptService.remove(session.user.id, promptId)
            return c.json(successResponse({ deleted: true }))
        }),
    )

    return route
}
