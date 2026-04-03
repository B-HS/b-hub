import { Hono } from 'hono'
import { generateSpecs } from 'hono-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { createMiddleware } from './middleware'
import { createPage } from './page'
import { createRouter } from './route/index'
import { compose } from './compose'
import type { AuthContext } from './lib/hono-types'

const app = new Hono<AuthContext>()
const { api, caldav } = createRouter(compose())

createMiddleware(app, {
    allowedDomains: ['gumyo.net', 'hyns.dev'],
    securityExcludePaths: ['/api/spotify/playing', '/caldav/', '/.well-known/caldav'],
    securityExcludeExactPaths: ['/', '/policy'],
})
app.route('', createPage())
app.route('/api', api)
app.route('/caldav', caldav)

if (process.env.NODE_ENV !== 'production') {
    app.get('/docs', async (c) => {
        const specs = await generateSpecs(app, {
            documentation: {
                info: {
                    title: 'Hyun Hub API',
                    version: '1.0.0',
                    description: 'Badge, Weather, Blog 통합 API',
                },
                servers: [
                    { url: 'https://api.gumyo.net', description: 'Production' },
                    { url: 'http://localhost:9999', description: 'Development' },
                ],
            },
        })
        return c.json(specs)
    })

    app.get('/swagger', swaggerUI({ url: '/docs' }))
}

export default {
    port: process.env.PORT || 9999,
    fetch: app.fetch,
}
