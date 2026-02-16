import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse, paginatedResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { postListQuerySchema, postCreateSchema, postUpdateSchema } from '../../dto/blog/post'
import type { PostService } from '../../service/domain/blog/post'

type PostRouteDeps = {
    postService: PostService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

export const createPostRoute = (deps: PostRouteDeps) => {
    const route = new Hono()

    route.get(
        '/',
        describeRoute({
            tags: ['Blog'],
            summary: '게시글 목록 조회',
            responses: { 200: { description: '게시글 목록' } },
        }),
        validator('query', postListQuerySchema),
        withErrorHandling(async (c) => {
            const query = c.req.valid('query' as never) as z.infer<typeof postListQuerySchema>
            const result = await deps.postService.list(query)
            return c.json(
                paginatedResponse(result.data, {
                    page: result.page,
                    limit: result.limit,
                    total: result.total,
                }),
            )
        }),
    )

    route.get(
        '/:id',
        describeRoute({
            tags: ['Blog'],
            summary: '게시글 상세 조회',
            responses: {
                200: { description: '게시글 상세' },
                ...errorResponses(['BLOG_POST_NOT_FOUND']),
            },
        }),
        withErrorHandling(async (c) => {
            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('BLOG_POST_NOT_FOUND')

            const post = await deps.postService.getById(id)
            if (!post) throw createAppError('BLOG_POST_NOT_FOUND')

            return c.json(successResponse({ post }))
        }),
    )

    route.post(
        '/',
        describeRoute({
            tags: ['Blog'],
            summary: '게시글 생성',
            responses: {
                200: { description: '생성된 게시글' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        validator('json', postCreateSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            if (session.user.role !== 'admin') throw createAppError('FORBIDDEN')

            const input = c.req.valid('json' as never) as z.infer<typeof postCreateSchema>
            const result = await deps.postService.create(input)
            return c.json(successResponse(result))
        }),
    )

    route.put(
        '/:id',
        describeRoute({
            tags: ['Blog'],
            summary: '게시글 수정',
            responses: {
                200: { description: '수정된 게시글' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN', 'BLOG_POST_NOT_FOUND']),
            },
        }),
        validator('json', postUpdateSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')
            if (session.user.role !== 'admin') throw createAppError('FORBIDDEN')

            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('BLOG_POST_NOT_FOUND')

            const input = c.req.valid('json' as never) as z.infer<typeof postUpdateSchema>
            const result = await deps.postService.update(id, input)
            if (!result) throw createAppError('BLOG_POST_NOT_FOUND')

            return c.json(successResponse(result))
        }),
    )

    return route
}
