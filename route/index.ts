import { Hono } from 'hono'
import { healthRoute } from './health'
import { createOAuthRoute } from './auth/oauth'
import { createTokenRoute } from './auth/token'
import { createBadgeRoute } from './badge'
import { createWeatherRoute } from './weather/weather'
import { createLocationRoute } from './weather/location'
import { createWeatherKeyRoute } from './weather/key'
import { createStoryRoute } from './hn/story'
import { createCronRoute } from './hn/cron'
import { createWebhookRoute } from './hn/webhook'
import { createDigestRoute } from './hn/digest'
import { createPostRoute } from './blog/post'
import { createCommentRoute } from './blog/comment'
import { createCategoryRoute } from './blog/category'
import { createTagRoute } from './blog/tag'
import { createMessageRoute } from './blog/message'
import { createImageRoute } from './blog/image'
import { createAdminRoute } from './blog/admin'
import { createThumbnailRoute } from './blog/thumbnail'
import { createMailAccountRoute } from './mail/account'
import { createMailFolderRoute } from './mail/folder'
import { createMailMessageRoute } from './mail/message'
import { createMailSyncRoute } from './mail/sync'
import { createMailUploadRoute } from './mail/upload'
import { createSpotifyAccountRoute } from './spotify/account'
import { createSpotifyKeyRoute } from './spotify/key'
import { createSpotifyDataRoute } from './spotify/data'
import { createSpotifyPlayingRoute } from './spotify/playing'
import { createSpotifyWidgetTokenRoute } from './spotify/widget-token'
import type { AuthProvider } from '../service/shared/auth-provider'
import type { ApiTokenService } from '../service/shared/api-token'
import type { BadgeService } from '../service/domain/badge/badge'
import type { KmaApiService } from '../service/domain/weather/kma-api'
import type { LocationService } from '../service/domain/weather/location'
import type { WeatherApiKeyService } from '../service/domain/weather/weather-api-key'
import type { HnFetcherService } from '../service/domain/hn/hn-fetcher'
import type { HnDigestService } from '../service/domain/hn/hn-digest'
import type { HnWebhookService } from '../service/domain/hn/hn-webhook'
import type { PostService } from '../service/domain/blog/post'
import type { CommentService } from '../service/domain/blog/comment'
import type { MessageService } from '../service/domain/blog/message'
import type { BlogImageService } from '../service/domain/blog/blog-image'
import type { ImageGenerator } from '../service/shared/image-generator'
import type { FontLoader } from '../service/shared/font-loader'
import type { MailAccountService } from '../service/domain/mail/mail-account'
import type { MailOAuthConnectService } from '../service/domain/mail/mail-oauth-connect'
import type { MailSyncService } from '../service/domain/mail/mail-sync'
import type { MailMessageService } from '../service/domain/mail/mail-message'
import type { MailUploadService } from '../service/domain/mail/mail-upload'
import type { SpotifyAccountService } from '../service/domain/spotify/spotify-account'
import type { SpotifyApiKeyService } from '../service/domain/spotify/spotify-api-key'
import type { SpotifyOAuthConnectService } from '../service/domain/spotify/spotify-oauth-connect'
import type { SpotifyDataService } from '../service/domain/spotify/spotify-data'
import type { SpotifyWidgetTokenService } from '../service/domain/spotify/spotify-widget-token'
import type { SpotifyWidgetService } from '../service/domain/spotify/spotify-widget'
import { createAppError } from '../lib/error'

type HnStoryDb = Parameters<typeof createStoryRoute>[0]['db']
type HnDigestDb = Parameters<typeof createDigestRoute>[0]['db']
type CategoryDb = Parameters<typeof createCategoryRoute>[0]['db']
type TagDb = Parameters<typeof createTagRoute>[0]['db']
type AdminDb = Parameters<typeof createAdminRoute>[0]['db']

type RouterDeps = {
    auth?: AuthProvider
    apiTokenService?: ApiTokenService
    getSession?: (c: { req: { raw: { headers: Headers } } }) => Promise<{
        user: {
            id: string
            name: string
            email: string
            role: string | null
            image: string | null
        }
    } | null>
    badgeService?: BadgeService
    kmaApi?: KmaApiService
    locationService?: LocationService
    weatherApiKeyService?: WeatherApiKeyService
    hnStoryDb?: HnStoryDb
    hnDigestDb?: HnDigestDb
    hnFetcher?: HnFetcherService
    hnDigest?: HnDigestService
    hnWebhook?: HnWebhookService
    cronSecret?: string
    postService?: PostService
    commentService?: CommentService
    messageService?: MessageService
    blogImageService?: BlogImageService
    categoryDb?: CategoryDb
    tagDb?: TagDb
    adminDb?: AdminDb
    imageGenerator?: ImageGenerator
    fontLoader?: FontLoader
    mailAccountService?: MailAccountService
    mailOAuthConnect?: MailOAuthConnectService
    mailSyncService?: MailSyncService
    mailMessageService?: MailMessageService
    mailUploadService?: MailUploadService
    mailFolderDb?: Parameters<typeof createMailFolderRoute>[0]['db']
    mailCheckLimit?: (key: string, path: string) => { allowed: boolean; limit: number; remaining: number; resetAt: number }
    spotifyAccountService?: SpotifyAccountService
    spotifyApiKeyService?: SpotifyApiKeyService
    spotifyOAuthConnect?: SpotifyOAuthConnectService
    spotifyDataService?: SpotifyDataService
    spotifyWidgetTokenService?: SpotifyWidgetTokenService
    spotifyWidgetService?: SpotifyWidgetService
    baseUrl?: string
}

const stub = <T>(obj?: T): T =>
    obj ??
    (new Proxy(
        {},
        {
            get: () => () => {
                throw createAppError('SERVICE_NOT_CONFIGURED')
            },
        },
    ) as T)

const stubFn = <T>(fn?: T): T =>
    fn ??
    ((() => {
        throw createAppError('SERVICE_NOT_CONFIGURED')
    }) as T)

export const createRouter = (deps: RouterDeps = {}) => {
    const router = new Hono()

    router.route('/health', healthRoute)

    router.route('/auth', createOAuthRoute({ auth: stub(deps.auth) }))
    router.route(
        '/auth/token',
        createTokenRoute({
            apiTokenService: stub(deps.apiTokenService),
            getSession: stubFn(deps.getSession) as never,
        }),
    )

    router.route(
        '/badge',
        createBadgeRoute({
            badgeService: stub(deps.badgeService),
        }),
    )

    router.route(
        '/weather/keys',
        createWeatherKeyRoute({
            weatherApiKeyService: stub(deps.weatherApiKeyService),
            getSession: stubFn(deps.getSession) as never,
        }),
    )
    router.route(
        '/weather',
        createWeatherRoute({
            kmaApi: stub(deps.kmaApi),
            locationService: stub(deps.locationService),
            weatherApiKeyService: stub(deps.weatherApiKeyService),
        }),
    )
    router.route(
        '/weather/locations',
        createLocationRoute({
            locationService: stub(deps.locationService),
            weatherApiKeyService: stub(deps.weatherApiKeyService),
        }),
    )

    router.route('/hn', createStoryRoute({ db: stub(deps.hnStoryDb) }))
    router.route('/hn/digests', createDigestRoute({ db: stub(deps.hnDigestDb) }))
    router.route(
        '/hn/cron',
        createCronRoute({
            cronSecret: deps.cronSecret ?? '',
            hnFetcher: stub(deps.hnFetcher),
            hnDigest: stub(deps.hnDigest),
            hnWebhook: stub(deps.hnWebhook),
        }),
    )
    router.route(
        '/hn/webhooks',
        createWebhookRoute({
            webhookService: stub(deps.hnWebhook),
            getSession: stubFn(deps.getSession) as never,
        }),
    )

    router.route(
        '/blog/posts',
        createPostRoute({
            postService: stub(deps.postService),
            getSession: stubFn(deps.getSession) as never,
        }),
    )
    router.route(
        '/blog/comments',
        createCommentRoute({
            commentService: stub(deps.commentService),
            getSession: stubFn(deps.getSession) as never,
        }),
    )
    router.route(
        '/blog/categories',
        createCategoryRoute({
            db: stub(deps.categoryDb),
            getSession: stubFn(deps.getSession) as never,
        }),
    )
    router.route(
        '/blog/tags',
        createTagRoute({
            db: stub(deps.tagDb),
            getSession: stubFn(deps.getSession) as never,
        }),
    )
    router.route(
        '/blog/messages',
        createMessageRoute({
            messageService: stub(deps.messageService),
            getSession: stubFn(deps.getSession) as never,
        }),
    )
    router.route(
        '/blog/images',
        createImageRoute({
            blogImageService: stub(deps.blogImageService),
            getSession: stubFn(deps.getSession) as never,
        }),
    )
    router.route(
        '/blog/admin',
        createAdminRoute({
            postService: stub(deps.postService),
            commentService: stub(deps.commentService),
            getSession: stubFn(deps.getSession) as never,
            db: stub(deps.adminDb),
        }),
    )
    router.route(
        '/blog/posts',
        createThumbnailRoute({
            postService: stub(deps.postService),
            imageGenerator: stub(deps.imageGenerator),
            fontLoader: stub(deps.fontLoader),
        }),
    )

    router.route(
        '/mail/accounts',
        createMailAccountRoute({
            mailAccountService: stub(deps.mailAccountService),
            getSession: stubFn(deps.getSession) as never,
            mailOAuthConnect: deps.mailOAuthConnect,
            baseUrl: deps.baseUrl,
        }),
    )
    router.route(
        '/mail/folders',
        createMailFolderRoute({
            db: stub(deps.mailFolderDb),
            mailAccountService: stub(deps.mailAccountService),
            getSession: stubFn(deps.getSession) as never,
        }),
    )
    router.route(
        '/mail/messages',
        createMailMessageRoute({
            mailMessageService: stub(deps.mailMessageService),
            getSession: stubFn(deps.getSession) as never,
            checkLimit: deps.mailCheckLimit,
        }),
    )
    router.route(
        '/mail/sync',
        createMailSyncRoute({
            mailSyncService: stub(deps.mailSyncService),
            getSession: stubFn(deps.getSession) as never,
            checkLimit: deps.mailCheckLimit,
        }),
    )
    router.route(
        '/mail/uploads',
        createMailUploadRoute({
            mailUploadService: stub(deps.mailUploadService),
            getSession: stubFn(deps.getSession) as never,
        }),
    )

    router.route(
        '/spotify/accounts',
        createSpotifyAccountRoute({
            spotifyAccountService: stub(deps.spotifyAccountService),
            getSession: stubFn(deps.getSession) as never,
            spotifyOAuthConnect: deps.spotifyOAuthConnect,
            baseUrl: deps.baseUrl,
        }),
    )
    router.route(
        '/spotify/keys',
        createSpotifyKeyRoute({
            spotifyApiKeyService: stub(deps.spotifyApiKeyService),
            spotifyAccountService: stub(deps.spotifyAccountService),
            getSession: stubFn(deps.getSession) as never,
        }),
    )
    router.route(
        '/spotify',
        createSpotifyDataRoute({
            spotifyDataService: stub(deps.spotifyDataService),
            spotifyApiKeyService: stub(deps.spotifyApiKeyService),
            spotifyAccountService: stub(deps.spotifyAccountService),
            getSession: stubFn(deps.getSession) as never,
        }),
    )
    router.route(
        '/spotify/playing',
        createSpotifyPlayingRoute({
            spotifyWidgetTokenService: stub(deps.spotifyWidgetTokenService),
            spotifyWidgetService: stub(deps.spotifyWidgetService),
            baseUrl: deps.baseUrl ?? '',
        }),
    )
    router.route(
        '/spotify/widget-tokens',
        createSpotifyWidgetTokenRoute({
            spotifyWidgetTokenService: stub(deps.spotifyWidgetTokenService),
            spotifyAccountService: stub(deps.spotifyAccountService),
            getSession: stubFn(deps.getSession) as never,
        }),
    )

    return router
}
