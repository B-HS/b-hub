import { Hono } from 'hono'
import { healthRoute } from './health'
import { createOAuthRoute } from './auth/oauth'
import { createTokenRoute } from './auth/token'
import { createBadgeRoute } from './badge'
import { createWeatherRoute } from './weather/weather'
import { createLocationRoute } from './weather/location'
import { createWeatherKeyRoute } from './weather/key'
import { createWeatherMockRoute } from './weather/mock'
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
import { createResumeRoute } from './resume/resume'
import { createCalendarEventRoute } from './calendar/event'
import { createCalendarSubscriptionRoute } from './calendar/subscription'
import { createCalendarIcsRoute } from './calendar/ics'
import { createCalendarGroupRoute } from './calendar/group'
import { createCalendarCaldavRoute } from './calendar/caldav'
import { createDriveAssetRoute } from './drive/asset'
import { createDriveFolderRoute } from './drive/folder'
import { createDriveLifecycleRoute } from './drive/lifecycle'
import type { compose } from '../compose'
import { createAppError } from '../lib/error'

type RouterDeps = Partial<ReturnType<typeof compose>>

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
        '/weather/mock',
        createWeatherMockRoute({
            mockKmaApi: stub(deps.mockKmaApi),
            locationService: stub(deps.locationService),
            weatherApiKeyService: stub(deps.weatherApiKeyService),
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

    router.route(
        '/resume',
        createResumeRoute({
            resumeService: stub(deps.resumeService),
            getSession: stubFn(deps.getSession) as never,
        }),
    )

    router.route(
        '/calendar/events',
        createCalendarEventRoute({
            calendarService: stub(deps.calendarService),
            getSession: stubFn(deps.getSession) as never,
        }),
    )
    router.route(
        '/calendar/groups',
        createCalendarGroupRoute({
            calendarService: stub(deps.calendarService),
            getSession: stubFn(deps.getSession) as never,
        }),
    )
    router.route(
        '/calendar/subscription',
        createCalendarSubscriptionRoute({
            calendarService: stub(deps.calendarService),
            getSession: stubFn(deps.getSession) as never,
            baseUrl: deps.baseUrl,
        }),
    )
    router.route(
        '/calendar',
        createCalendarIcsRoute({
            calendarService: stub(deps.calendarService),
        }),
    )

    router.route(
        '/drive',
        createDriveAssetRoute({
            driveAssetService: stub(deps.driveAssetService),
            getSession: stubFn(deps.getSession) as never,
            getGdriveAccessToken: deps.getGdriveAccessToken ?? (() => Promise.resolve(null)),
            gdriveRootFolderId: deps.gdriveRootFolderId ?? '',
        }),
    )
    router.route(
        '/drive/folders',
        createDriveFolderRoute({
            driveFolderService: stub(deps.driveFolderService),
            getSession: stubFn(deps.getSession) as never,
        }),
    )
    router.route(
        '/drive/lifecycle',
        createDriveLifecycleRoute({
            storageLifecycleService: stub(deps.storageLifecycleService),
            uploadServerSecret: deps.uploadServerSecret ?? '',
        }),
    )

    return {
        api: router,
        caldav: createCalendarCaldavRoute({ calendarService: stub(deps.calendarService), caldavService: stub(deps.caldavService) }),
    }
}
