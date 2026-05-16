import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import type { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { imageCompleteRequestSchema } from '../../dto/blog/image'
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
        '/prepare',
        describeRoute({
            tags: ['Blog'],
            summary: '이미지 업로드 준비 (assetId/uploadToken 발급)',
            responses: {
                200: { description: '업로드 준비 정보' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            if (session.user.role !== 'admin') throw createAppError('FORBIDDEN')

            const result = deps.blogImageService.prepare(session.user.id)
            return c.json(successResponse(result))
        }),
    )

    route.delete(
        '/:id',
        describeRoute({
            tags: ['Blog'],
            summary: '이미지 삭제',
            responses: {
                200: { description: '삭제 완료' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            if (session.user.role !== 'admin') throw createAppError('FORBIDDEN')

            const id = c.req.param('id')
            await deps.blogImageService.delete(id)
            return c.json(successResponse({ id }))
        }),
    )

    route.post(
        '/complete',
        describeRoute({
            tags: ['Blog'],
            summary: '업로드 완료 콜백 (upload-server 전용)',
            responses: {
                200: { description: '이미지 메타데이터 저장 완료' },
                ...errorResponses(['UNAUTHORIZED', 'VALIDATION_ERROR']),
            },
        }),
        validator('json', imageCompleteRequestSchema),
        withErrorHandling(async (c) => {
            const body = c.req.valid('json' as never) as z.infer<typeof imageCompleteRequestSchema>
            const result = await deps.blogImageService.complete(body)
            return c.json(successResponse(result))
        }),
    )

    return route
}
