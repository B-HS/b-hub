import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { commentListQuerySchema, commentCreateSchema, commentUpdateSchema } from '../../dto/blog/comment'
import type { CommentService } from '../../service/domain/blog/comment'

type CommentRouteDeps = {
    commentService: CommentService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

export const createCommentRoute = (deps: CommentRouteDeps) => {
    const route = new Hono()

    route.get(
        '/',
        describeRoute({
            tags: ['Blog'],
            summary: '댓글 목록 조회',
            responses: { 200: { description: '댓글 목록' } },
        }),
        validator('query', commentListQuerySchema),
        withErrorHandling(async (c) => {
            const query = c.req.valid('query' as never) as z.infer<typeof commentListQuerySchema>
            const comments = await deps.commentService.listByPostId(query.postId)
            return c.json(successResponse({ comments }))
        }),
    )

    route.post(
        '/',
        describeRoute({
            tags: ['Blog'],
            summary: '댓글 작성',
            responses: {
                200: { description: '생성된 댓글' },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        validator('json', commentCreateSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const input = c.req.valid('json' as never) as z.infer<typeof commentCreateSchema>
            const result = await deps.commentService.create(session.user.id, input)
            return c.json(successResponse(result))
        }),
    )

    route.patch(
        '/:id',
        describeRoute({
            tags: ['Blog'],
            summary: '댓글 수정',
            responses: {
                200: { description: '수정 결과' },
                ...errorResponses(['UNAUTHORIZED', 'BLOG_COMMENT_NOT_FOUND']),
            },
        }),
        validator('json', commentUpdateSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('BLOG_COMMENT_NOT_FOUND')

            const input = c.req.valid('json' as never) as z.infer<typeof commentUpdateSchema>
            const result = await deps.commentService.update(id, session.user.id, input)
            if (!result.success) throw createAppError('BLOG_COMMENT_NOT_FOUND')

            return c.json(successResponse({ success: true }))
        }),
    )

    route.delete(
        '/:id',
        describeRoute({
            tags: ['Blog'],
            summary: '댓글 삭제',
            responses: {
                200: { description: '삭제 결과' },
                ...errorResponses(['UNAUTHORIZED', 'BLOG_COMMENT_NOT_FOUND']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('BLOG_COMMENT_NOT_FOUND')

            const result = await deps.commentService.delete(id, session.user.id)
            if (!result.success) throw createAppError('BLOG_COMMENT_NOT_FOUND')

            return c.json(successResponse({ success: true }))
        }),
    )

    return route
}
