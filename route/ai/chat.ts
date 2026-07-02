import { Hono } from 'hono'
import type { Context } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { withAuth } from '../../lib/with-auth'
import { withRateLimit } from '../../lib/with-rate-limit'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { aiChatSendSchema, aiCompletionSchema } from '../../dto/ai/chat'
import type { AiChatService } from '../../service/domain/ai/ai-chat'

type AiChatRouteDeps = {
    aiChatService: AiChatService
    getSession: Parameters<typeof withAuth>[0]['getSession']
    checkLimit?: Parameters<typeof withRateLimit>[0]['checkLimit']
}

const CHAT_ERROR_CODES = [
    'UNAUTHORIZED',
    'RATE_LIMIT_EXCEEDED',
    'AI_SESSION_NOT_FOUND',
    'AI_PROVIDER_NOT_FOUND',
    'AI_REAUTH_REQUIRED',
    'AI_COMPLETION_FAILED',
    'AI_PROVIDER_ERROR',
] as const

export const createAiChatRoute = (deps: AiChatRouteDeps) => {
    const route = new Hono()

    const rateLimited = (handler: (c: Context, user: { id: string }) => Promise<Response>, pathKey: string) =>
        deps.checkLimit ? withRateLimit({ checkLimit: deps.checkLimit, pathKey })(handler) : handler

    route.post(
        '/sessions/:sessionId/messages',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 채팅 메시지 전송·응답 생성',
            responses: { 200: { description: '응답 메시지' }, ...errorResponses([...CHAT_ERROR_CODES]) },
        }),
        validator('json', aiChatSendSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(
                rateLimited(async (c, user) => {
                    const sessionId = c.req.param('sessionId')
                    const input = c.req.valid('json' as never) as z.infer<typeof aiChatSendSchema>
                    const result = await deps.aiChatService.send(user.id, sessionId, input)
                    return c.json(successResponse(result))
                }, 'ai:chat:send'),
            ),
        ),
    )

    route.post(
        '/completions',
        describeRoute({
            tags: ['AI'],
            summary: '세션 없는 단발 AI completion(도메인 융합용)',
            responses: { 200: { description: 'completion 결과' }, ...errorResponses([...CHAT_ERROR_CODES]) },
        }),
        validator('json', aiCompletionSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(
                rateLimited(async (c, user) => {
                    const input = c.req.valid('json' as never) as z.infer<typeof aiCompletionSchema>
                    const result = await deps.aiChatService.complete(user.id, input)
                    return c.json(successResponse(result))
                }, 'ai:chat:completion'),
            ),
        ),
    )

    return route
}
