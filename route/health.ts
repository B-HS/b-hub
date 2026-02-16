import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'

export const healthRoute = new Hono()

healthRoute.get(
    '/',
    describeRoute({
        tags: ['Health'],
        summary: 'Health check',
        responses: {
            200: { description: 'OK' },
        },
    }),
    (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }),
)
