import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import type { MailUploadService } from '../../service/domain/mail/mail-upload'

type UploadRouteDeps = {
    mailUploadService: MailUploadService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string } } | null>
}

export const createMailUploadRoute = (deps: UploadRouteDeps) => {
    const route = new Hono()

    route.post(
        '/',
        describeRoute({
            tags: ['Mail'],
            summary: '메일 첨부파일/인라인 이미지 업로드',
            responses: {
                200: { description: '업로드 결과' },
                ...errorResponses(['UNAUTHORIZED', 'MAIL_UPLOAD_TOO_LARGE', 'MAIL_UPLOAD_INVALID_TYPE']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const formData = await c.req.formData()
            const file = formData.get('file') as File | null
            if (!file) throw createAppError('VALIDATION_ERROR')

            const inline = formData.get('inline') === 'true'

            const result = await deps.mailUploadService.upload(file, session.user.id, inline)
            return c.json(successResponse(result))
        }),
    )

    route.delete(
        '/:uploadId',
        describeRoute({
            tags: ['Mail'],
            summary: '업로드된 파일 삭제',
            responses: {
                200: { description: '삭제 완료' },
                ...errorResponses(['UNAUTHORIZED', 'MAIL_UPLOAD_NOT_FOUND']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const uploadId = parseInt(c.req.param('uploadId')!, 10)
            if (isNaN(uploadId)) throw createAppError('VALIDATION_ERROR')

            await deps.mailUploadService.deleteUpload(uploadId, session.user.id)
            return c.json(successResponse({ deleted: true }))
        }),
    )

    return route
}
