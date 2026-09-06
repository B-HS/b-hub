import { Hono } from 'hono'
import { generateSpecs } from 'hono-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { eq } from 'drizzle-orm'
import { createMiddleware } from './middleware'
import { createPage } from './page'
import { createRouter } from './route/index'
import { compose } from './compose'
import { getEnv } from './lib/env'
import { getDb } from './db'
import { mailAccounts } from './db/schema'
import type { AuthContext } from './lib/hono-types'

const app = new Hono<AuthContext>()
const composed = compose()
const { api, caldav } = createRouter(composed)

const triggerMailSync = async (accountId: number) => {
    const [account] = await getDb().select({ userId: mailAccounts.userId }).from(mailAccounts).where(eq(mailAccounts.id, accountId)).limit(1)
    if (account) await composed.mailSyncService.syncAccount(accountId, account.userId)
}

createMiddleware(app, {
    allowedDomains: ['gumyo.net', 'hyns.dev'],
    securityExcludePaths: ['/api/spotify/playing', '/caldav/', '/.well-known/caldav'],
    securityExcludeExactPaths: ['/', '/policy'],
    securityHtmlPaths: ['/admin', '/manage'],
    logEventService: composed.logEventService,
})
app.route(
    '',
    createPage({
        admin: {
            getSession: composed.getSession,
            db: getDb(),
            auth: composed.auth,
            triggerMailSync,
            csrfSecret: getEnv().BETTER_AUTH_SECRET,
            metricsTokenService: composed.metricsTokenService,
            storage: {
                deleteObject: (key: string) => composed.storageService.del(key),
                deleteGdriveObject: async (fileId: string) => {
                    const gdrive = await composed.initGdriveStorage()
                    if (gdrive) await gdrive.del(fileId)
                },
            },
        },
        manage: {
            getSession: composed.getSession,
            apiTokenService: composed.apiTokenService,
            weatherApiKeyService: composed.weatherApiKeyService,
            aiConnectionService: composed.aiConnectionService,
            mailAccountService: composed.mailAccountService,
            mailMessageService: composed.mailMessageService,
            mailSyncService: composed.mailSyncService,
            mailUploadService: composed.mailUploadService,
            mailFolderDb: composed.mailFolderDb,
            calendarService: composed.calendarService,
            driveFolderService: composed.driveFolderService,
            driveAssetService: composed.driveAssetService,
            resumeService: composed.resumeService,
            spotifyAccountService: composed.spotifyAccountService,
            spotifyApiKeyService: composed.spotifyApiKeyService,
            spotifyWidgetTokenService: composed.spotifyWidgetTokenService,
            baseUrl: composed.baseUrl,
            auth: composed.auth,
            csrfSecret: getEnv().BETTER_AUTH_SECRET,
        },
    }),
)
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
