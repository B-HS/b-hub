import { Hono } from 'hono'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { describeRoute } from 'hono-openapi'
import { withErrorHandling } from '../../lib/with-error-handling'
import { withAuth } from '../../lib/with-auth'
import { withRateLimit } from '../../lib/with-rate-limit'
import { createAppError } from '../../lib/error'
import { errorResponse, successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import type { AiAttachmentService } from '../../service/domain/ai/ai-attachment'

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024
const UPLOAD_BODY_LIMIT_BYTES = MAX_ATTACHMENT_BYTES + MULTIPART_OVERHEAD_BYTES

type AiAttachmentRouteDeps = {
    aiAttachmentService: AiAttachmentService
    getSession: Parameters<typeof withAuth>[0]['getSession']
    checkLimit?: Parameters<typeof withRateLimit>[0]['checkLimit']
}

export const createAiAttachmentRoute = (deps: AiAttachmentRouteDeps) => {
    const route = new Hono()

    const uploadHandler = async (c: Context, user: { id: string }) => {
        const formData = await c.req.formData()
        const file = formData.get('file') as File | null
        if (!file) throw createAppError('VALIDATION_ERROR')
        const result = await deps.aiAttachmentService.upload(file, user.id)
        return c.json(successResponse(result))
    }

    route.post(
        '/',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 첨부 이미지 업로드(vision 입력, R2 영구화)',
            responses: {
                200: { description: '업로드 결과' },
                ...errorResponses(['UNAUTHORIZED', 'RATE_LIMIT_EXCEEDED', 'AI_ATTACHMENT_TOO_LARGE', 'AI_ATTACHMENT_INVALID_TYPE']),
            },
        }),
        bodyLimit({
            maxSize: UPLOAD_BODY_LIMIT_BYTES,
            onError: (c) => {
                const error = createAppError('AI_ATTACHMENT_TOO_LARGE')
                return c.json(errorResponse(error.code, error.message), error.statusCode as 413)
            },
        }),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(
                deps.checkLimit ? withRateLimit({ checkLimit: deps.checkLimit, pathKey: 'ai:attachment:upload' })(uploadHandler) : uploadHandler,
            ),
        ),
    )

    route.delete(
        '/:attachmentId',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 첨부 이미지 삭제',
            responses: { 200: { description: '삭제 완료' }, ...errorResponses(['UNAUTHORIZED', 'AI_ATTACHMENT_NOT_FOUND']) },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const attachmentId = Number(c.req.param('attachmentId'))
            if (isNaN(attachmentId)) throw createAppError('AI_ATTACHMENT_NOT_FOUND')
            await deps.aiAttachmentService.remove(session.user.id, attachmentId)
            return c.json(successResponse({ deleted: true }))
        }),
    )

    return route
}
