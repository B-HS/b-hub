import { mock } from 'bun:test'
import type { AdminGetSession, AdminSessionUser } from '../../../page/admin/guard'
import type { AiService } from '../../../service/domain/ai/ai'
import type { ApiTokenService } from '../../../service/shared/api-token'
import type { WeatherApiKeyService } from '../../../service/domain/weather/weather-api-key'
import type { MailAccountService } from '../../../service/domain/mail/mail-account'

export const mockAdmin: AdminSessionUser = { id: 'a1', name: 'Admin', email: 'admin@example.com', role: 'admin', image: null }
export const mockUser: AdminSessionUser = { id: 'u1', name: 'User', email: 'user@example.com', role: 'user', image: null }

export const sessionOf = (user: AdminSessionUser | null): AdminGetSession => mock(() => Promise.resolve(user ? { user } : null))

const ok = () => Promise.resolve()
const emptyArr = <T>() => Promise.resolve([] as T[])

export const stubAiService = (overrides: Partial<AiService> = {}): AiService =>
    ({
        listKeys: () => emptyArr(),
        getStatus: () =>
            Promise.resolve([
                { provider: 'omlx', connected: false, keyCount: 0 },
                { provider: 'openai', connected: false, keyCount: 0 },
                { provider: 'ollama_cloud', connected: false, keyCount: 0 },
                { provider: 'anthropic', connected: false, keyCount: 0 },
            ]),
        addKey: () => Promise.reject(new Error('not stubbed')),
        deleteKey: () => Promise.resolve({ deleted: true }),
        chatStream: () => Promise.reject(new Error('not stubbed')),
        ...overrides,
    }) as unknown as AiService

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
        ...overrides,
    }) as unknown as MailAccountService
