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
import { createManageMailAccountsRoute } from './pages/mail-accounts'
import { createManageMailMessagesRoute, type ManageMailFolderDb } from './pages/mail-messages'
import { createManageMailSyncRoute } from './pages/mail-sync'
import { createManageCalendarEventsRoute } from './pages/calendar-events'
import { createManageCalendarGroupsRoute } from './pages/calendar-groups'
import { createManageCalendarSubscriptionRoute } from './pages/calendar-subscription'
import { createManageDriveFoldersRoute } from './pages/drive-folders'
import { createManageDriveAssetsRoute } from './pages/drive-assets'
import { createManageResumeRoute } from './pages/resume'
import { createManageSpotifyAccountsRoute } from './pages/spotify-accounts'
import { createManageSpotifyKeysRoute } from './pages/spotify-keys'
import { createManageSpotifyWidgetTokensRoute } from './pages/spotify-widget-tokens'
import type { AuthProvider } from '../../service/shared/auth-provider'
import type { AiService } from '../../service/domain/ai/ai'
import type { ApiTokenService } from '../../service/shared/api-token'
import type { WeatherApiKeyService } from '../../service/domain/weather/weather-api-key'
import type { MailAccountService } from '../../service/domain/mail/mail-account'
import type { MailMessageService } from '../../service/domain/mail/mail-message'
import type { MailSyncService } from '../../service/domain/mail/mail-sync'
import type { MailUploadService } from '../../service/domain/mail/mail-upload'
import type { CalendarService } from '../../service/domain/calendar/calendar'
import type { DriveFolderService } from '../../service/domain/drive/drive-folder'
import type { DriveAssetService } from '../../service/domain/drive/drive-asset'
import type { ResumeService } from '../../service/domain/resume/resume'
import type { SpotifyAccountService } from '../../service/domain/spotify/spotify-account'
import type { SpotifyApiKeyService } from '../../service/domain/spotify/spotify-api-key'
import type { SpotifyWidgetTokenService } from '../../service/domain/spotify/spotify-widget-token'

export type ManageRouteDeps = {
    getSession: ManageGetSession
    apiTokenService: ApiTokenService
    weatherApiKeyService: WeatherApiKeyService
    aiService?: AiService
    mailAccountService?: MailAccountService
    mailMessageService?: MailMessageService
    mailSyncService?: MailSyncService
    mailUploadService?: MailUploadService
    mailFolderDb?: ManageMailFolderDb
    calendarService?: CalendarService
    driveFolderService?: DriveFolderService
    driveAssetService?: DriveAssetService
    resumeService?: ResumeService
    spotifyAccountService?: SpotifyAccountService
    spotifyApiKeyService?: SpotifyApiKeyService
    spotifyWidgetTokenService?: SpotifyWidgetTokenService
    baseUrl?: string
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

    app.route('/mail/accounts', createManageMailAccountsRoute({ getSession: deps.getSession, mailAccountService: deps.mailAccountService }))
    app.route(
        '/mail/messages',
        createManageMailMessagesRoute({
            getSession: deps.getSession,
            mailMessageService: deps.mailMessageService,
            mailAccountService: deps.mailAccountService,
            mailFolderDb: deps.mailFolderDb,
            mailUploadService: deps.mailUploadService,
        }),
    )
    app.route(
        '/mail/sync',
        createManageMailSyncRoute({
            getSession: deps.getSession,
            mailSyncService: deps.mailSyncService,
            mailAccountService: deps.mailAccountService,
        }),
    )

    app.route('/calendar/events', createManageCalendarEventsRoute({ getSession: deps.getSession, calendarService: deps.calendarService }))
    app.route('/calendar/groups', createManageCalendarGroupsRoute({ getSession: deps.getSession, calendarService: deps.calendarService }))
    app.route(
        '/calendar/subscription',
        createManageCalendarSubscriptionRoute({ getSession: deps.getSession, calendarService: deps.calendarService, baseUrl: deps.baseUrl }),
    )

    app.route('/drive/folders', createManageDriveFoldersRoute({ getSession: deps.getSession, driveFolderService: deps.driveFolderService }))
    app.route('/drive/assets', createManageDriveAssetsRoute({ getSession: deps.getSession, driveAssetService: deps.driveAssetService }))

    app.route('/resume', createManageResumeRoute({ getSession: deps.getSession, resumeService: deps.resumeService }))

    app.route(
        '/spotify/accounts',
        createManageSpotifyAccountsRoute({ getSession: deps.getSession, spotifyAccountService: deps.spotifyAccountService }),
    )
    app.route(
        '/spotify/keys',
        createManageSpotifyKeysRoute({
            getSession: deps.getSession,
            spotifyApiKeyService: deps.spotifyApiKeyService,
            spotifyAccountService: deps.spotifyAccountService,
        }),
    )
    app.route(
        '/spotify/widget-tokens',
        createManageSpotifyWidgetTokensRoute({
            getSession: deps.getSession,
            spotifyWidgetTokenService: deps.spotifyWidgetTokenService,
            spotifyAccountService: deps.spotifyAccountService,
        }),
    )

    return app
}
