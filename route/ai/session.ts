import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse, paginatedResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { aiSessionCreateSchema, aiSessionUpdateSchema, aiSessionListQuerySchema } from '../../dto/ai/session'
import { aiMessageListQuerySchema } from '../../dto/ai/chat'
import type { AiSession, AiMessage } from '../../db/schema'
import type { AiSessionService } from '../../service/domain/ai/ai-session'
import type { AiConnectionService } from '../../service/domain/ai/ai-connection'
import type { AiPromptService } from '../../service/domain/ai/ai-prompt'

type AiSessionRouteDeps = {
    aiSessionService: AiSessionService
    aiConnectionService: AiConnectionService
    aiPromptService: AiPromptService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

const toSessionResponse = (row: AiSession) => ({
    id: row.id,
    provider: row.provider,
    modelId: row.modelId,
    title: row.title,
    featureKey: row.featureKey,
    promptIds: row.promptIds,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
})

const toMessageResponse = (row: AiMessage) => ({
    id: row.id,
    sessionId: row.sessionId,
    role: row.role,
    content: row.content,
    modelId: row.modelId,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
})

export const createAiSessionRoute = (deps: AiSessionRouteDeps) => {
    const route = new Hono()

    route.get(
        '/',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 채팅 세션 목록',
            responses: { 200: { description: '세션 목록' }, ...errorResponses(['UNAUTHORIZED']) },
        }),
        validator('query', aiSessionListQuerySchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const query = c.req.valid('query' as never) as z.infer<typeof aiSessionListQuerySchema>
            const { rows, total } = await deps.aiSessionService.list(session.user.id, query)
            return c.json(paginatedResponse(rows.map(toSessionResponse), { page: query.page, limit: query.limit, total }))
        }),
    )

    route.post(
        '/',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 채팅 세션 생성(연결 검증 포함)',
            responses: { 200: { description: '생성된 세션' }, ...errorResponses(['UNAUTHORIZED', 'AI_PROVIDER_NOT_FOUND', 'AI_REAUTH_REQUIRED']) },
        }),
        validator('json', aiSessionCreateSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const input = c.req.valid('json' as never) as z.infer<typeof aiSessionCreateSchema>
            const { row } = await deps.aiConnectionService.resolveClient(session.user.id, input.provider)
            if (input.promptIds?.length) await deps.aiPromptService.resolveOwned(session.user.id, input.promptIds)
            const created = await deps.aiSessionService.create(session.user.id, input, row.id)
            return c.json(successResponse(toSessionResponse(created)))
        }),
    )

    route.patch(
        '/:sessionId',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 채팅 세션 수정',
            responses: { 200: { description: '수정된 세션' }, ...errorResponses(['UNAUTHORIZED', 'AI_SESSION_NOT_FOUND']) },
        }),
        validator('json', aiSessionUpdateSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const sessionId = c.req.param('sessionId')!
            const input = c.req.valid('json' as never) as z.infer<typeof aiSessionUpdateSchema>
            const updated = await deps.aiSessionService.update(session.user.id, sessionId, input)
            return c.json(successResponse(toSessionResponse(updated)))
        }),
    )

    route.delete(
        '/:sessionId',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 채팅 세션 삭제',
            responses: { 200: { description: '삭제 완료' }, ...errorResponses(['UNAUTHORIZED', 'AI_SESSION_NOT_FOUND']) },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const sessionId = c.req.param('sessionId')!
            await deps.aiSessionService.remove(session.user.id, sessionId)
            return c.json(successResponse({ deleted: true }))
        }),
    )

    route.get(
        '/:sessionId/messages',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 채팅 세션 메시지 목록',
            responses: { 200: { description: '메시지 목록' }, ...errorResponses(['UNAUTHORIZED', 'AI_SESSION_NOT_FOUND']) },
        }),
        validator('query', aiMessageListQuerySchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const sessionId = c.req.param('sessionId')!
            const query = c.req.valid('query' as never) as z.infer<typeof aiMessageListQuerySchema>
            const { rows, total } = await deps.aiSessionService.listMessages(session.user.id, sessionId, query)
            return c.json(paginatedResponse(rows.map(toMessageResponse), { page: query.page, limit: query.limit, total }))
        }),
    )

    return route
}
