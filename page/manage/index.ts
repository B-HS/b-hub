import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { contextStorage } from 'hono/context-storage'
import { ADMIN_DESIGN_TOKENS_CACHE_HEADERS, ADMIN_DESIGN_TOKENS_CSS } from '../admin/styles'
import { createAdminCsrfGuard } from '../admin/csrf'
import { THEME_COOKIE_MAX_AGE } from '../admin/theme'
import { MANAGE_THEME_COOKIE, sanitizeTheme } from './theme'
import type { ManageGetSession } from './guard'
import { createManageLoginRoute } from './login'
import { createManageOverviewRoute } from './pages/overview'
import { createManageAiKeysRoute } from './pages/ai'
import { createManageTokensRoute } from './pages/tokens'
import { createManageWeatherKeysRoute } from './pages/weather'
import type { AuthProvider } from '../../service/shared/auth-provider'
import type { AiService } from '../../service/domain/ai/ai'
import type { ApiTokenService } from '../../service/shared/api-token'
import type { WeatherApiKeyService } from '../../service/domain/weather/weather-api-key'
import type { MailAccountService } from '../../service/domain/mail/mail-account'

export type ManageRouteDeps = {
    getSession: ManageGetSession
    apiTokenService: ApiTokenService
    weatherApiKeyService: WeatherApiKeyService
    aiService?: AiService
    mailAccountService?: MailAccountService
    auth?: AuthProvider
    csrfSecret?: string
}

export const createManageRoute = (deps: ManageRouteDeps) => {
    const app = new Hono()

    app.get('/styles.css', (c) => c.body(ADMIN_DESIGN_TOKENS_CSS, { headers: ADMIN_DESIGN_TOKENS_CACHE_HEADERS }))
    app.get('/theme', (c) => {
        const to = sanitizeTheme(c.req.query('to'))
        const returnToRaw = c.req.query('returnTo')
        const returnTo = returnToRaw && returnToRaw.startsWith('/manage') ? returnToRaw : '/manage'
        setCookie(c, MANAGE_THEME_COOKIE, to, {
            path: '/manage',
            maxAge: THEME_COOKIE_MAX_AGE,
            sameSite: 'Lax',
            secure: process.env.NODE_ENV === 'production',
        })
        return c.redirect(returnTo, 303)
    })

    app.route('/login', createManageLoginRoute({ getSession: deps.getSession, auth: deps.auth }))

    app.use('*', contextStorage())
    app.use('*', createAdminCsrfGuard({ getSession: deps.getSession, secret: deps.csrfSecret }))

    app.route(
        '/',
        createManageOverviewRoute({
            getSession: deps.getSession,
            aiService: deps.aiService,
            apiTokenService: deps.apiTokenService,
            weatherApiKeyService: deps.weatherApiKeyService,
            mailAccountService: deps.mailAccountService,
        }),
    )
    app.route('/ai/keys', createManageAiKeysRoute({ getSession: deps.getSession, aiService: deps.aiService }))
    app.route('/tokens', createManageTokensRoute({ getSession: deps.getSession, apiTokenService: deps.apiTokenService }))
    app.route('/weather/keys', createManageWeatherKeysRoute({ getSession: deps.getSession, weatherApiKeyService: deps.weatherApiKeyService }))

    return app
}
