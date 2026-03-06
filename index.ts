import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { generateSpecs } from 'hono-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { securityHeaders } from './middleware/security-headers'
import { errorHandler } from './middleware/error-handler'
import { createRouter } from './route/index'
import { compose } from './compose'
import type { AuthContext } from './lib/hono-types'

const app = new Hono<AuthContext>()

const isAllowedOrigin = (origin: string) => {
    try {
        const { hostname } = new URL(origin)
        if (hostname === 'gumyo.net' || hostname.endsWith('.gumyo.net')) return true
        if (hostname === 'hyns.dev' || hostname.endsWith('.hyns.dev')) return true
        if (process.env.NODE_ENV !== 'production' && hostname === 'localhost') return true
        return false
    } catch {
        return false
    }
}

app.use(
    '*',
    cors({
        origin: (origin) => (origin && isAllowedOrigin(origin) ? origin : ''),
        credentials: true,
    }),
)

app.use('*', securityHeaders({ excludePaths: ['/api/spotify/playing'] }))
app.use('*', errorHandler())

app.get('/', (c) => c.json({ name: 'hyun-hub', version: '1.0.0' }))

const deps = compose()
const router = createRouter({
    auth: deps.auth,
    apiTokenService: deps.apiTokenService,
    getSession: deps.getSession,
    postService: deps.postService,
    commentService: deps.commentService,
    messageService: deps.messageService,
    blogImageService: deps.blogImageService,
    categoryDb: deps.categoryDb,
    tagDb: deps.tagDb,
    adminDb: deps.adminDb,
    imageGenerator: deps.imageGenerator,
    fontLoader: deps.fontLoader,
    badgeService: deps.badgeService,
    kmaApi: deps.kmaApi,
    locationService: deps.locationService,
    weatherApiKeyService: deps.weatherApiKeyService,
    hnStoryDb: deps.hnStoryDb,
    hnDigestDb: deps.hnDigestDb,
    hnFetcher: deps.hnFetcher,
    hnDigest: deps.hnDigest,
    hnWebhook: deps.hnWebhook,
    cronSecret: deps.cronSecret,
    mailAccountService: deps.mailAccountService,
    mailOAuthConnect: deps.mailOAuthConnect,
    mailSyncService: deps.mailSyncService,
    mailMessageService: deps.mailMessageService,
    mailUploadService: deps.mailUploadService,
    mailFolderDb: deps.mailFolderDb,
    mailCheckLimit: deps.mailCheckLimit,
    spotifyAccountService: deps.spotifyAccountService,
    spotifyApiKeyService: deps.spotifyApiKeyService,
    spotifyOAuthConnect: deps.spotifyOAuthConnect,
    spotifyDataService: deps.spotifyDataService,
    spotifyWidgetTokenService: deps.spotifyWidgetTokenService,
    spotifyWidgetService: deps.spotifyWidgetService,
    baseUrl: deps.baseUrl,
})
app.route('/api', router)

if (process.env.NODE_ENV !== 'production') {
    app.get('/docs', async (c) => {
        const specs = await generateSpecs(app, {
            documentation: {
                info: {
                    title: 'Hyun Hub API',
                    version: '1.0.0',
                    description: 'Badge, Weather, HN Digest, Blog 통합 API',
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
