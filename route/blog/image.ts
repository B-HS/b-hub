import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import type { BlogImageService } from '../../service/domain/blog/blog-image'

type ImageRouteDeps = {
    blogImageService: BlogImageService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

export const createImageRoute = (deps: ImageRouteDeps) => {
    const route = new Hono()

    route.get(
        '/',
        describeRoute({
            tags: ['Blog'],
            summary: '이미지 목록 조회',
            responses: {
                200: { description: '이미지 목록' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            if (session.user.role !== 'admin') throw createAppError('FORBIDDEN')

            const images = await deps.blogImageService.getList()
            return c.json(successResponse({ images }))
        }),
    )

    route.post(
        '/upload',
        describeRoute({
            tags: ['Blog'],
            summary: '이미지 업로드',
            responses: {
                200: { description: '업로드된 이미지 정보' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN', 'BLOG_IMAGE_TOO_LARGE']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            if (session.user.role !== 'admin') throw createAppError('FORBIDDEN')

            const formData = await c.req.formData()
            const file = formData.get('file') as File | null
            if (!file) throw createAppError('VALIDATION_ERROR')

            const result = await deps.blogImageService.upload(file, session.user.id)
            return c.json(successResponse(result))
        }),
    )

    return route
}
