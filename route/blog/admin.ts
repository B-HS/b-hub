import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import type { PostService } from '../../service/domain/blog/post'
import type { CommentService } from '../../service/domain/blog/comment'

type AdminUser = {
    id: string
    name: string | null
    email: string
    image: string | null
    role: string | null
    createdAt: Date
    postsCount: number
    commentsCount: number
}

type PostWithCategory = {
    postId: number
    categoryId: number
    categoryName: string | null
    title: string
    isPublished: boolean
    isHide: boolean
    createdAt: Date
}

type CommentWithPost = {
    commentId: number
    postId: number
    postTitle: string
    userId: string
    userName: string
    comment: string
    isHide: boolean
    createdAt: Date
}

type AdminRouteDeps = {
    postService: PostService
    commentService: CommentService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
    db: {
        getAllUsers: () => Promise<AdminUser[]>
        getAllPosts: () => Promise<PostWithCategory[]>
        getAllComments: () => Promise<CommentWithPost[]>
        deleteUser: (userId: string) => Promise<{ id: string }>
    }
}

const hideSchema = z.object({
    isHide: z.boolean(),
})

export const createAdminRoute = (deps: AdminRouteDeps) => {
    const route = new Hono()

    const requireAdmin = async (c: { req: { raw: { headers: Headers } } }) => {
        const session = await deps.getSession(c)
        if (!session) throw createAppError('UNAUTHORIZED')
        if (session.user.role !== 'admin') throw createAppError('FORBIDDEN')
        return session
    }

    route.get(
        '/users',
        describeRoute({
            tags: ['Blog Admin'],
            summary: '전체 사용자 조회',
            responses: {
                200: { description: '사용자 목록' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        withErrorHandling(async (c) => {
            await requireAdmin(c)
            const users = await deps.db.getAllUsers()
            return c.json(successResponse({ users }))
        }),
    )

    route.delete(
        '/users/:id',
        describeRoute({
            tags: ['Blog Admin'],
            summary: '사용자 삭제',
            responses: {
                200: { description: '삭제 결과' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        withErrorHandling(async (c) => {
            await requireAdmin(c)
            const userId = c.req.param('id')!
            const result = await deps.db.deleteUser(userId)
            return c.json(successResponse(result))
        }),
    )

    route.get(
        '/posts',
        describeRoute({
            tags: ['Blog Admin'],
            summary: '전체 게시글 조회 (관리자)',
            responses: {
                200: { description: '게시글 목록' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        withErrorHandling(async (c) => {
            await requireAdmin(c)
            const posts = await deps.db.getAllPosts()
            return c.json(successResponse({ posts }))
        }),
    )

    route.delete(
        '/posts/:id',
        describeRoute({
            tags: ['Blog Admin'],
            summary: '게시글 삭제 (관리자)',
            responses: {
                200: { description: '삭제 결과' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN', 'BLOG_POST_NOT_FOUND']),
            },
        }),
        withErrorHandling(async (c) => {
            await requireAdmin(c)
            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('BLOG_POST_NOT_FOUND')

            const result = await deps.postService.delete(id)
            if (!result) throw createAppError('BLOG_POST_NOT_FOUND')

            return c.json(successResponse(result))
        }),
    )

    route.patch(
        '/posts/:id',
        describeRoute({
            tags: ['Blog Admin'],
            summary: '게시글 숨김 토글 (관리자)',
            responses: {
                200: { description: '수정 결과' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN', 'BLOG_POST_NOT_FOUND']),
            },
        }),
        validator('json', hideSchema),
        withErrorHandling(async (c) => {
            await requireAdmin(c)
            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('BLOG_POST_NOT_FOUND')

            const input = c.req.valid('json' as never) as z.infer<typeof hideSchema>
            const result = await deps.postService.update(id, {
                isHide: input.isHide,
            })
            if (!result) throw createAppError('BLOG_POST_NOT_FOUND')

            return c.json(successResponse(result))
        }),
    )

    route.get(
        '/comments',
        describeRoute({
            tags: ['Blog Admin'],
            summary: '전체 댓글 조회 (관리자)',
            responses: {
                200: { description: '댓글 목록' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        withErrorHandling(async (c) => {
            await requireAdmin(c)
            const comments = await deps.db.getAllComments()
            return c.json(successResponse({ comments }))
        }),
    )

    route.delete(
        '/comments/:id',
        describeRoute({
            tags: ['Blog Admin'],
            summary: '댓글 삭제 (관리자)',
            responses: {
                200: { description: '삭제 결과' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN', 'BLOG_COMMENT_NOT_FOUND']),
            },
        }),
        withErrorHandling(async (c) => {
            await requireAdmin(c)
            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('BLOG_COMMENT_NOT_FOUND')

            const result = await deps.commentService.adminDelete(id)
            if (!result) throw createAppError('BLOG_COMMENT_NOT_FOUND')

            return c.json(successResponse(result))
        }),
    )

    route.patch(
        '/comments/:id',
        describeRoute({
            tags: ['Blog Admin'],
            summary: '댓글 숨김 토글 (관리자)',
            responses: {
                200: { description: '수정 결과' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN', 'BLOG_COMMENT_NOT_FOUND']),
            },
        }),
        validator('json', hideSchema),
        withErrorHandling(async (c) => {
            await requireAdmin(c)
            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('BLOG_COMMENT_NOT_FOUND')

            const input = c.req.valid('json' as never) as z.infer<typeof hideSchema>
            const result = await deps.commentService.adminUpdateHide(id, input.isHide)
            if (!result) throw createAppError('BLOG_COMMENT_NOT_FOUND')

            return c.json(successResponse(result))
        }),
    )

    return route
}
