import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { contextStorage } from 'hono/context-storage'
import type { AuthProvider } from '../../service/shared/auth-provider'
import { createAdminDb, type AdminDb } from './db'
import type { AdminGetSession } from './guard'
import { createAdminCsrfGuard } from './csrf'
import { ADMIN_THEME_COOKIE, THEME_COOKIE_MAX_AGE, sanitizeTheme } from './theme'
import { ADMIN_DESIGN_TOKENS_CACHE_HEADERS, ADMIN_DESIGN_TOKENS_CSS } from './styles'
import { createLoginRoute } from './login'
import { createDashboardRoute } from './dashboard'
import { createUsersRoute } from './pages/users'
import { createSessionsRoute } from './pages/sessions'
import { createApiLogsRoute, createApiTokensRoute } from './pages/api'
import { createLogEventsRoute } from './pages/logs'
import { createBlogRoute } from './pages/blog'
import { createMessagesRoute } from './pages/messages'
import { createWeatherRoute } from './pages/weather'
import { createMailRoute, type TriggerMailSync } from './pages/mail'
import { createSpotifyRoute } from './pages/spotify'
import { createResumesRoute } from './pages/resumes'
import { createCalendarRoute } from './pages/calendar'
import { createDriveRoute } from './pages/drive'
import { createAiProvidersRoute, createAiSessionsRoute, createAiPromptsRoute } from './pages/ai'
import { createMetricsTokensRoute } from './pages/metrics'
import type { MetricsTokenService } from '../../service/domain/metrics/token'
import type { Database } from '../../db'

export type AdminRouteDeps = {
    getSession: AdminGetSession
    db?: Database
    adminDb?: AdminDb
    auth?: AuthProvider
    triggerMailSync?: TriggerMailSync
    csrfSecret?: string
    metricsTokenService?: MetricsTokenService
}

export const createAdminRoute = (deps: AdminRouteDeps) => {
    const adminDb = deps.adminDb ?? (deps.db ? createAdminDb(deps.db) : null)
    if (!adminDb) throw new Error('createAdminRoute requires either `db` or `adminDb`')

    const app = new Hono()

    app.get('/styles.css', (c) => c.body(ADMIN_DESIGN_TOKENS_CSS, { headers: ADMIN_DESIGN_TOKENS_CACHE_HEADERS }))
    app.get('/theme', (c) => {
        const to = sanitizeTheme(c.req.query('to'))
        const returnToRaw = c.req.query('returnTo')
        const returnTo = returnToRaw && returnToRaw.startsWith('/admin') ? returnToRaw : '/admin'
        setCookie(c, ADMIN_THEME_COOKIE, to, {
            path: '/admin',
            maxAge: THEME_COOKIE_MAX_AGE,
            sameSite: 'Lax',
            secure: process.env.NODE_ENV === 'production',
        })
        return c.redirect(returnTo, 303)
    })

    app.use('*', contextStorage())
    app.use('*', createAdminCsrfGuard({ getSession: deps.getSession, secret: deps.csrfSecret }))

    app.route('/login', createLoginRoute({ getSession: deps.getSession, auth: deps.auth }))

    const baseDeps = { getSession: deps.getSession, adminDb }
    app.route('/', createDashboardRoute(baseDeps))
    app.route('/users', createUsersRoute(baseDeps))
    app.route('/sessions', createSessionsRoute(baseDeps))
    app.route('/api/tokens', createApiTokensRoute(baseDeps))
    app.route('/api/logs', createApiLogsRoute(baseDeps))
    app.route('/logs', createLogEventsRoute(baseDeps))
    app.route('/blog', createBlogRoute(baseDeps))
    app.route('/messages', createMessagesRoute(baseDeps))
    app.route('/weather', createWeatherRoute(baseDeps))
    app.route('/mail', createMailRoute({ ...baseDeps, triggerMailSync: deps.triggerMailSync }))
    app.route('/spotify', createSpotifyRoute(baseDeps))
    app.route('/resumes', createResumesRoute(baseDeps))
    app.route('/calendar', createCalendarRoute(baseDeps))
    app.route('/drive', createDriveRoute(baseDeps))
    app.route('/metrics/tokens', createMetricsTokensRoute({ getSession: deps.getSession, metricsTokenService: deps.metricsTokenService }))
    app.route('/ai/providers', createAiProvidersRoute(baseDeps))
    app.route('/ai/sessions', createAiSessionsRoute(baseDeps))
    app.route('/ai/prompts', createAiPromptsRoute(baseDeps))

    return app
}
