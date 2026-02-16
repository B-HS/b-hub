import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { categoryCreateSchema } from '../../dto/blog/category'

type Category = {
    categoryId: number
    category: string
    isHide: boolean
}

type CategoryRouteDeps = {
    db: {
        getCategoryList: () => Promise<Category[]>
        createCategory: (category: string) => Promise<Category>
    }
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

export const createCategoryRoute = (deps: CategoryRouteDeps) => {
    const route = new Hono()

    const requireAdmin = async (c: { req: { raw: { headers: Headers } } }) => {
        const session = await deps.getSession(c)
        if (!session) throw createAppError('UNAUTHORIZED')
        if (session.user.role !== 'admin') throw createAppError('FORBIDDEN')
        return session
    }

    route.get(
        '/',
        describeRoute({
            tags: ['Blog'],
            summary: '카테고리 목록 조회',
            responses: { 200: { description: '카테고리 목록' } },
        }),
        withErrorHandling(async (c) => {
            const categories = await deps.db.getCategoryList()
            return c.json(successResponse({ categories }))
        }),
    )

    route.post(
        '/',
        describeRoute({
            tags: ['Blog'],
            summary: '카테고리 생성',
            responses: {
                200: { description: '생성된 카테고리' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        validator('json', categoryCreateSchema),
        withErrorHandling(async (c) => {
            await requireAdmin(c)
            const input = c.req.valid('json' as never) as z.infer<typeof categoryCreateSchema>
            const result = await deps.db.createCategory(input.category)
            return c.json(successResponse(result))
        }),
    )

    return route
}
