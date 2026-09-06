import { and, eq } from 'drizzle-orm'
import * as schema from '../db/schema'
import { createCache } from '../service/shared/cache'
import { createSpotifyAccountService } from '../service/domain/spotify/spotify-account'
import { createSpotifyApiKeyService } from '../service/domain/spotify/spotify-api-key'
import { createSpotifyOAuthConnectService } from '../service/domain/spotify/spotify-oauth-connect'
import { createSpotifyDataService } from '../service/domain/spotify/spotify-data'
import { createSpotifyProviderFactory } from '../service/domain/spotify/spotify-provider'
import { createSpotifyWidgetTokenService } from '../service/domain/spotify/spotify-widget-token'
import { createSpotifyWidgetService } from '../service/domain/spotify/spotify-widget'
import type { ComposeSpotifyArgs } from './types'

const MS_PER_SECOND = 1000

export const composeSpotify = ({ db, env }: ComposeSpotifyArgs) => {
    const spotifyAccountDb = {
        list: async (userId: string) => {
            return db.select().from(schema.spotifyAccounts).where(eq(schema.spotifyAccounts.userId, userId))
        },
        getById: async (id: number) => {
            const [account] = await db.select().from(schema.spotifyAccounts).where(eq(schema.spotifyAccounts.id, id)).limit(1)
            return account ?? null
        },
        update: async (id: number, data: Partial<Pick<schema.SpotifyAccount, 'displayName' | 'isActive'>>) => {
            await db.update(schema.spotifyAccounts).set(data).where(eq(schema.spotifyAccounts.id, id))
        },
        remove: async (id: number) => {
            await db.delete(schema.spotifyAccounts).where(eq(schema.spotifyAccounts.id, id))
        },
    }

    const spotifyAccountService = createSpotifyAccountService({ db: spotifyAccountDb })

    const spotifyApiKeyDb = {
        insert: async (data: { userId: string; spotifyAccountId: number; token: string; name: string | null }) => {
            const [result] = await db.insert(schema.spotifyApiKeys).values(data).$returningId()
            return result
        },
        findByToken: async (tokenHash: string) => {
            const [record] = await db
                .select({
                    id: schema.spotifyApiKeys.id,
                    userId: schema.spotifyApiKeys.userId,
                    spotifyAccountId: schema.spotifyApiKeys.spotifyAccountId,
                    expiresAt: schema.spotifyApiKeys.expiresAt,
                })
                .from(schema.spotifyApiKeys)
                .where(eq(schema.spotifyApiKeys.token, tokenHash))
                .limit(1)
            return record ?? null
        },
        updateLastUsedAt: async (id: number) => {
            await db.update(schema.spotifyApiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.spotifyApiKeys.id, id))
        },
        remove: async (userId: string, keyId: number) => {
            await db.delete(schema.spotifyApiKeys).where(and(eq(schema.spotifyApiKeys.id, keyId), eq(schema.spotifyApiKeys.userId, userId)))
        },
        listByUser: async (userId: string) => {
            return db
                .select({
                    id: schema.spotifyApiKeys.id,
                    spotifyAccountId: schema.spotifyApiKeys.spotifyAccountId,
                    name: schema.spotifyApiKeys.name,
                    expiresAt: schema.spotifyApiKeys.expiresAt,
                    lastUsedAt: schema.spotifyApiKeys.lastUsedAt,
                    createdAt: schema.spotifyApiKeys.createdAt,
                })
                .from(schema.spotifyApiKeys)
                .where(eq(schema.spotifyApiKeys.userId, userId))
        },
    }

    const spotifyApiKeyService = createSpotifyApiKeyService({ db: spotifyApiKeyDb })

    const spotifyOAuthConnect = createSpotifyOAuthConnectService({
        spotifyClientId: env.SPOTIFY_CLIENT_ID ?? '',
        spotifyClientSecret: env.SPOTIFY_CLIENT_SECRET ?? '',
        secret: env.BETTER_AUTH_SECRET ?? '',
        findAccountByProviderAndUser: async (providerId: string, userId: string, accountId: string) => {
            const [acc] = await db
                .select({ id: schema.account.id })
                .from(schema.account)
                .where(and(eq(schema.account.providerId, providerId), eq(schema.account.userId, userId), eq(schema.account.accountId, accountId)))
                .limit(1)
            return acc ?? null
        },
        upsertAccount: async (data) => {
            await db
                .insert(schema.account)
                .values({
                    id: data.id,
                    accountId: data.accountId,
                    providerId: data.providerId,
                    userId: data.userId,
                    accessToken: data.accessToken,
                    refreshToken: data.refreshToken,
                    accessTokenExpiresAt: data.accessTokenExpiresAt,
                    scope: data.scope,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                } as never)
                .onDuplicateKeyUpdate({
                    set: {
                        accessToken: data.accessToken,
                        refreshToken: data.refreshToken,
                        accessTokenExpiresAt: data.accessTokenExpiresAt,
                        scope: data.scope,
                        updatedAt: new Date(),
                    } as never,
                })
            return { id: data.id }
        },
        findSpotifyAccountByUserId: async (userId: string, spotifyUserId: string) => {
            const [acc] = await db
                .select({ id: schema.spotifyAccounts.id })
                .from(schema.spotifyAccounts)
                .where(and(eq(schema.spotifyAccounts.userId, userId), eq(schema.spotifyAccounts.spotifyUserId, spotifyUserId)))
                .limit(1)
            return acc ?? null
        },
        createSpotifyAccount: async (data) => {
            const [result] = await db.insert(schema.spotifyAccounts).values(data).$returningId()
            return result
        },
        updateSpotifyAccount: async (id, data) => {
            await db
                .update(schema.spotifyAccounts)
                .set(data as never)
                .where(eq(schema.spotifyAccounts.id, id))
        },
    })

    const createSpotifyProviderForAccount = createSpotifyProviderFactory({
        findAccount: async (spotifyAccountId: number) => {
            const spotifyAccount = await spotifyAccountDb.getById(spotifyAccountId)
            if (!spotifyAccount) return null
            return { betterAuthAccountId: spotifyAccount.betterAuthAccountId, isActive: spotifyAccount.isActive }
        },
        getOAuthToken: async (betterAuthAccountId: string) => {
            const [acc] = await db
                .select({ accessToken: schema.account.accessToken, refreshToken: schema.account.refreshToken })
                .from(schema.account)
                .where(eq(schema.account.id, betterAuthAccountId))
                .limit(1)
            if (!acc?.accessToken) return null
            return { accessToken: acc.accessToken, refreshToken: acc.refreshToken ?? undefined }
        },
        refreshOAuthToken: async (betterAuthAccountId: string, refreshTokenValue: string) => {
            const res = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${env.SPOTIFY_CLIENT_ID ?? ''}:${env.SPOTIFY_CLIENT_SECRET ?? ''}`).toString('base64')}`,
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshTokenValue,
                }),
            })
            if (!res.ok) return { status: res.status }
            const data = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string }
            await db
                .update(schema.account)
                .set({
                    accessToken: data.access_token,
                    accessTokenExpiresAt: new Date(Date.now() + data.expires_in * MS_PER_SECOND),
                    ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
                })
                .where(eq(schema.account.id, betterAuthAccountId))
            return { accessToken: data.access_token }
        },
    })

    const spotifyDataService = createSpotifyDataService({
        createProvider: createSpotifyProviderForAccount,
    })

    const spotifyWidgetTokenDb = {
        insert: async (data: { userId: string; spotifyAccountId: number; token: string; name: string | null }) => {
            const [result] = await db.insert(schema.spotifyWidgetTokens).values(data).$returningId()
            return result
        },
        findByToken: async (token: string) => {
            const [record] = await db
                .select({
                    id: schema.spotifyWidgetTokens.id,
                    userId: schema.spotifyWidgetTokens.userId,
                    spotifyAccountId: schema.spotifyWidgetTokens.spotifyAccountId,
                    isActive: schema.spotifyWidgetTokens.isActive,
                })
                .from(schema.spotifyWidgetTokens)
                .where(eq(schema.spotifyWidgetTokens.token, token))
                .limit(1)
            return record ?? null
        },
        remove: async (userId: string, tokenId: number) => {
            await db
                .delete(schema.spotifyWidgetTokens)
                .where(and(eq(schema.spotifyWidgetTokens.id, tokenId), eq(schema.spotifyWidgetTokens.userId, userId)))
        },
        listByUser: async (userId: string) => {
            return db
                .select({
                    id: schema.spotifyWidgetTokens.id,
                    spotifyAccountId: schema.spotifyWidgetTokens.spotifyAccountId,
                    name: schema.spotifyWidgetTokens.name,
                    isActive: schema.spotifyWidgetTokens.isActive,
                    createdAt: schema.spotifyWidgetTokens.createdAt,
                })
                .from(schema.spotifyWidgetTokens)
                .where(eq(schema.spotifyWidgetTokens.userId, userId))
        },
        updateIsActive: async (userId: string, tokenId: number, isActive: boolean) => {
            await db
                .update(schema.spotifyWidgetTokens)
                .set({ isActive })
                .where(and(eq(schema.spotifyWidgetTokens.id, tokenId), eq(schema.spotifyWidgetTokens.userId, userId)))
        },
    }

    const spotifyWidgetTokenService = createSpotifyWidgetTokenService({ db: spotifyWidgetTokenDb })

    const albumArtCache = createCache<string>({ maxSize: 200, defaultTtlMs: 5 * 60 * 1000 })
    const spotifyWidgetService = createSpotifyWidgetService({ spotifyDataService, albumArtCache })

    return {
        spotifyAccountService,
        spotifyApiKeyService,
        spotifyOAuthConnect,
        spotifyDataService,
        spotifyWidgetTokenService,
        spotifyWidgetService,
    }
}
