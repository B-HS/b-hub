import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import type { AiAttachmentService } from '../../service/domain/ai/ai-attachment'

type AiAttachmentRouteDeps = {
    aiAttachmentService: AiAttachmentService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

export const createAiAttachmentRoute = (deps: AiAttachmentRouteDeps) => {
    const route = new Hono()

    route.post(
        '/',
        describeRoute({
            tags: ['AI'],
            summary: 'AI 첨부 이미지 업로드(vision 입력, R2 영구화)',
            responses: {
                200: { description: '업로드 결과' },
                ...errorResponses(['UNAUTHORIZED', 'AI_ATTACHMENT_TOO_LARGE', 'AI_ATTACHMENT_INVALID_TYPE']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            const formData = await c.req.formData()
            const file = formData.get('file') as File | null
            if (!file) throw createAppError('VALIDATION_ERROR')
            const result = await deps.aiAttachmentService.upload(file, session.user.id)
            return c.json(successResponse(result))
        }),
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
