import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse, paginatedResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { resumeCreateSchema, resumeUpdateSchema, resumeListQuerySchema } from '../../dto/resume/resume'
import type { ResumeService } from '../../service/domain/resume/resume'

type ResumeRouteDeps = {
    resumeService: ResumeService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

export const createResumeRoute = (deps: ResumeRouteDeps) => {
    const route = new Hono()

    route.get(
        '/',
        describeRoute({
            tags: ['Resume'],
            summary: '내 이력서 목록 조회',
            responses: {
                200: { description: '이력서 목록' },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        validator('query', resumeListQuerySchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const query = c.req.valid('query' as never) as z.infer<typeof resumeListQuerySchema>
            const { resumes, total } = await deps.resumeService.list(session.user.id, query)
            return c.json(paginatedResponse(resumes, { page: query.page, limit: query.limit, total }))
        }),
    )

    route.get(
        '/:id',
        describeRoute({
            tags: ['Resume'],
            summary: '이력서 상세 조회',
            responses: {
                200: { description: '이력서 상세' },
                ...errorResponses(['UNAUTHORIZED', 'RESUME_NOT_FOUND']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('RESUME_NOT_FOUND')

            const result = await deps.resumeService.getById(id, session.user.id)
            if (!result.success) throw createAppError('RESUME_NOT_FOUND')

            return c.json(successResponse(result.success ? result.resume : null))
        }),
    )

    route.post(
        '/',
        describeRoute({
            tags: ['Resume'],
            summary: '이력서 생성',
            responses: {
                200: { description: '생성된 이력서' },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        validator('json', resumeCreateSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const input = c.req.valid('json' as never) as z.infer<typeof resumeCreateSchema>
            const result = await deps.resumeService.create(session.user.id, input)
            return c.json(successResponse(result))
        }),
    )

    route.patch(
        '/:id',
        describeRoute({
            tags: ['Resume'],
            summary: '이력서 수정',
            responses: {
                200: { description: '수정 결과' },
                ...errorResponses(['UNAUTHORIZED', 'RESUME_NOT_FOUND']),
            },
        }),
        validator('json', resumeUpdateSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('RESUME_NOT_FOUND')

            const input = c.req.valid('json' as never) as z.infer<typeof resumeUpdateSchema>
            const result = await deps.resumeService.update(id, session.user.id, input)
            if (!result.success) throw createAppError('RESUME_NOT_FOUND')

            return c.json(successResponse({ success: true }))
        }),
    )

    route.delete(
        '/:id',
        describeRoute({
            tags: ['Resume'],
            summary: '이력서 삭제',
            responses: {
                200: { description: '삭제 결과' },
                ...errorResponses(['UNAUTHORIZED', 'RESUME_NOT_FOUND']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('RESUME_NOT_FOUND')

            const result = await deps.resumeService.delete(id, session.user.id)
            if (!result.success) throw createAppError('RESUME_NOT_FOUND')

            return c.json(successResponse({ success: true }))
        }),
    )

    return route
}
