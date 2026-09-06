import { mock } from 'bun:test'
import type { AdminGetSession, AdminSessionUser } from '../../../page/admin/guard'
import type { AiConnectionService } from '../../../service/domain/ai/ai-connection'
import type { ApiTokenService } from '../../../service/shared/api-token'
import type { WeatherApiKeyService } from '../../../service/domain/weather/weather-api-key'
import type { MailAccountService } from '../../../service/domain/mail/mail-account'
import type { MailMessageService } from '../../../service/domain/mail/mail-message'
import type { MailSyncService } from '../../../service/domain/mail/mail-sync'
import type { MailUploadService } from '../../../service/domain/mail/mail-upload'
import type { ManageMailFolderDb } from '../../../page/manage/pages/mail-messages'
import type { CalendarService } from '../../../service/domain/calendar/calendar'
import type { DriveFolderService } from '../../../service/domain/drive/drive-folder'
import type { DriveAssetService } from '../../../service/domain/drive/drive-asset'
import type { ResumeService } from '../../../service/domain/resume/resume'
import type { SpotifyAccountService } from '../../../service/domain/spotify/spotify-account'
import type { SpotifyApiKeyService } from '../../../service/domain/spotify/spotify-api-key'
import type { SpotifyWidgetTokenService } from '../../../service/domain/spotify/spotify-widget-token'

export const mockAdmin: AdminSessionUser = { id: 'a1', name: 'Admin', email: 'admin@example.com', role: 'admin', image: null }
export const mockUser: AdminSessionUser = { id: 'u1', name: 'User', email: 'user@example.com', role: 'user', image: null }

export const sessionOf = (user: AdminSessionUser | null): AdminGetSession => mock(() => Promise.resolve(user ? { user } : null))

const ok = () => Promise.resolve()
const emptyArr = <T>() => Promise.resolve([] as T[])

export const stubAiConnectionService = (overrides: Partial<AiConnectionService> = {}): AiConnectionService =>
    ({
        list: () => emptyArr(),
        getOwned: () => Promise.reject(new Error('not stubbed')),
        connect: () => Promise.reject(new Error('not stubbed')),
        update: () => Promise.reject(new Error('not stubbed')),
        remove: () => ok(),
        resolveClient: () => Promise.reject(new Error('not stubbed')),
        touchUsed: () => ok(),
        touchModelsFetched: () => ok(),
        ...overrides,
    }) as unknown as AiConnectionService

export const stubApiTokenService = (overrides: Partial<ApiTokenService> = {}): ApiTokenService =>
    ({
        create: () => Promise.resolve('plain-token-value'),
        validate: () => Promise.resolve(null),
        revoke: () => ok(),
        revokeById: () => ok(),
        listByUser: () => emptyArr(),
        ...overrides,
    }) as unknown as ApiTokenService

export const stubWeatherApiKeyService = (overrides: Partial<WeatherApiKeyService> = {}): WeatherApiKeyService =>
    ({
        create: () => Promise.resolve('plain-weather-key'),
        validate: () => Promise.resolve(null),
        checkRateLimit: () => Promise.resolve(true),
        logRequest: () => ok(),
        revoke: () => ok(),
        listByUser: () => emptyArr(),
        updateDailyLimit: () => ok(),
        getById: () => Promise.resolve(null),
        ...overrides,
    }) as unknown as WeatherApiKeyService

export const stubMailAccountService = (overrides: Partial<MailAccountService> = {}): MailAccountService =>
    ({
        list: () => emptyArr(),
        getById: () => Promise.reject(new Error('not stubbed')),
        create: () => Promise.resolve({ id: 1 }),
        update: () => ok(),
        remove: () => ok(),
        testConnection: () => Promise.resolve({ success: true }),
        ...overrides,
    }) as unknown as MailAccountService

export const stubMailMessageService = (overrides: Partial<MailMessageService> = {}): MailMessageService =>
    ({
        list: () => Promise.resolve({ data: [], total: 0 }),
        search: () => Promise.resolve({ data: [], total: 0 }),
        getById: () => Promise.reject(new Error('not stubbed')),
        markRead: () => ok(),
        markUnread: () => ok(),
        markStarred: () => ok(),
        unmarkStarred: () => ok(),
        markAllRead: () => Promise.resolve({ updated: 0 }),
        deleteMessages: () => ok(),
        moveToFolder: () => ok(),
        send: () => Promise.resolve({ messageId: 'm1' }),
        reply: () => Promise.resolve({ messageId: 'm1' }),
        forward: () => Promise.resolve({ messageId: 'm1' }),
        ...overrides,
    }) as unknown as MailMessageService

export const stubMailSyncService = (overrides: Partial<MailSyncService> = {}): MailSyncService =>
    ({
        getSyncStatus: () => Promise.resolve({ status: 'idle' }),
        syncAccount: () => Promise.resolve({ added: 0, updated: 0, deleted: 0 }),
        syncHistorical: () => Promise.resolve({ added: 0, updated: 0, deleted: 0, durationMs: 0 }),
        ...overrides,
    }) as unknown as MailSyncService

export const stubMailUploadService = (overrides: Partial<MailUploadService> = {}): MailUploadService =>
    ({
        deleteUpload: () => ok(),
        ...overrides,
    }) as unknown as MailUploadService

export const stubMailFolderDb = (overrides: Partial<ManageMailFolderDb> = {}): ManageMailFolderDb => ({
    getFoldersByAccount: () => emptyArr(),
    ...overrides,
})

export const stubCalendarService = (overrides: Partial<CalendarService> = {}): CalendarService =>
    ({
        getAllEvents: () => emptyArr(),
        getGroups: () => emptyArr(),
        getEventByUid: () => Promise.resolve(null),
        createEvent: () => Promise.reject(new Error('not stubbed')),
        updateEvent: () => Promise.reject(new Error('not stubbed')),
        deleteEvent: () => ok(),
        createGroup: () => Promise.resolve({ id: 'g1', userId: 'u1', name: 'g', color: '#000', sortOrder: 0, isVisible: true }),
        updateGroup: () => ok(),
        deleteGroup: () => ok(),
        getSubscription: () => Promise.resolve(null),
        createSubscription: () => Promise.reject(new Error('not stubbed')),
        regenerateSubscriptionToken: () => Promise.resolve('new-token'),
        regenerateIcsToken: () => Promise.resolve('new-ics-token'),
        ...overrides,
    }) as unknown as CalendarService

export const stubDriveFolderService = (overrides: Partial<DriveFolderService> = {}): DriveFolderService =>
    ({
        list: () => emptyArr(),
        create: () => Promise.resolve({ id: 'f1', userId: 'u1', parentId: null, name: 'f' }),
        update: () => Promise.resolve({ id: 'f1' }),
        remove: () => Promise.resolve({ id: 'f1' }),
        ...overrides,
    }) as unknown as DriveFolderService

export const stubDriveAssetService = (overrides: Partial<DriveAssetService> = {}): DriveAssetService =>
    ({
        list: () => Promise.resolve({ data: [], total: 0, page: 1, limit: 20 }),
        getQuota: () => Promise.resolve({ used: 0, total: 100, remaining: 100 }),
        getDetail: () => Promise.reject(new Error('not stubbed')),
        update: () => Promise.resolve({ id: 1 }),
        remove: () => Promise.resolve({ id: 1 }),
        ...overrides,
    }) as unknown as DriveAssetService

export const stubResumeService = (overrides: Partial<ResumeService> = {}): ResumeService =>
    ({
        list: () => Promise.resolve({ resumes: [], total: 0 }),
        getById: () => Promise.resolve({ success: false as const, reason: 'not_found' as const }),
        create: () => Promise.resolve({ id: 1 }),
        update: () => Promise.resolve({ success: true as const }),
        delete: () => Promise.resolve({ success: true as const }),
        ...overrides,
    }) as unknown as ResumeService

export const stubSpotifyAccountService = (overrides: Partial<SpotifyAccountService> = {}): SpotifyAccountService =>
    ({
        list: () => emptyArr(),
        getById: () => Promise.reject(new Error('not stubbed')),
        update: () => ok(),
        remove: () => ok(),
        ...overrides,
    }) as unknown as SpotifyAccountService

export const stubSpotifyApiKeyService = (overrides: Partial<SpotifyApiKeyService> = {}): SpotifyApiKeyService =>
    ({
        listByUser: () => emptyArr(),
        create: () => Promise.resolve('plain-spotify-key'),
        revoke: () => ok(),
        ...overrides,
    }) as unknown as SpotifyApiKeyService

export const stubSpotifyWidgetTokenService = (overrides: Partial<SpotifyWidgetTokenService> = {}): SpotifyWidgetTokenService =>
    ({
        listByUser: () => emptyArr(),
        create: () => Promise.resolve({ token: 'plain-widget-token' }),
        revoke: () => ok(),
        toggleActive: () => ok(),
        ...overrides,
    }) as unknown as SpotifyWidgetTokenService

export const cookieHeaderFrom = (res: Response) =>
    res.headers
        .getSetCookie()
        .map((raw) => raw.split(';')[0])
        .join('; ')
