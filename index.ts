import { Hono } from 'hono'
import { generateSpecs } from 'hono-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { createMiddleware } from './middleware'
import { createPage } from './page'
import { createRouter } from './route/index'
import { createCalendarCaldavRoute } from './route/calendar/caldav'
import { compose } from './compose'
import type { AuthContext } from './lib/hono-types'

const app = new Hono<AuthContext>()

createMiddleware(app, {
    allowedDomains: ['gumyo.net', 'hyns.dev'],
    securityExcludePaths: ['/api/spotify/playing', '/caldav/', '/.well-known/caldav'],
    securityExcludeExactPaths: ['/', '/policy'],
})

app.route('', createPage())

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
    resumeService: deps.resumeService,
    calendarService: deps.calendarService,
    caldavService: deps.caldavService,
    baseUrl: deps.baseUrl,
})
app.route('/api', router)

if (deps.calendarService && deps.caldavService) {
    const caldavRoute = createCalendarCaldavRoute({
        calendarService: deps.calendarService,
        caldavService: deps.caldavService,
    })
    app.route('/caldav', caldavRoute)
}

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

