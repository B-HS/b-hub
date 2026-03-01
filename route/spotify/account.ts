import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { resolver, validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { withAuth } from '../../lib/with-auth'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { createAppError } from '../../lib/error'
import { spotifyAccountUpdateSchema, spotifyAccountParamSchema, spotifyAccountResponseSchema } from '../../dto/spotify/account'
import type { SpotifyAccountService } from '../../service/domain/spotify/spotify-account'
import type { SpotifyOAuthConnectService } from '../../service/domain/spotify/spotify-oauth-connect'
import type { AuthContext } from '../../lib/hono-types'

type SpotifyAccountRouteDeps = {
    spotifyAccountService: SpotifyAccountService
    getSession: Parameters<typeof withAuth>[0]['getSession']
    spotifyOAuthConnect?: SpotifyOAuthConnectService
    baseUrl?: string
}

const formatAccount = (a: { id: number; spotifyUserId: string; displayName: string | null; email: string | null; isActive: boolean; createdAt: Date; updatedAt: Date }) => ({
    id: a.id,
    spotifyUserId: a.spotifyUserId,
    displayName: a.displayName,
    email: a.email,
    isActive: a.isActive,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
})

export const createSpotifyAccountRoute = (deps: SpotifyAccountRouteDeps) => {
    const route = new Hono<AuthContext>()

    route.get(
        '/',
        describeRoute({
            tags: ['Spotify'],
            summary: 'Spotify 계정 목록 조회',
            responses: {
                200: {
                    description: '계정 목록',
                    content: { 'application/json': { schema: resolver(z.object({ success: z.literal(true), data: z.array(spotifyAccountResponseSchema) })) } },
                },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const accounts = await deps.spotifyAccountService.list(user.id)
                return c.json(successResponse(accounts.map(formatAccount)))
            }),
        ),
    )

    route.get(
        '/connect',
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                if (!deps.spotifyOAuthConnect || deps.baseUrl === undefined) {
                    throw createAppError('SERVICE_NOT_CONFIGURED')
                }
                const redirect = c.req.query('redirect') || undefined
                const authUrl = await deps.spotifyOAuthConnect.generateAuthUrl(user.id, deps.baseUrl, redirect)
                return c.redirect(authUrl, 302)
            }),
        ),
    )

    route.get(
        '/connect/callback',
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                if (!deps.spotifyOAuthConnect || deps.baseUrl === undefined) {
                    throw createAppError('SERVICE_NOT_CONFIGURED')
                }

                const code = c.req.query('code')
                const state = c.req.query('state')
                const errorParam = c.req.query('error')

                if (errorParam || !code || !state) {
                    const redirect = state ? deps.spotifyOAuthConnect.parseRedirectFromState(state) : null
                    const target = redirect || deps.baseUrl
                    return c.redirect(`${target}?error=oauth_denied`, 302)
                }

                try {
                    const result = await deps.spotifyOAuthConnect.handleCallback(code, state, user.id, deps.baseUrl)
                    const target = result.redirect || deps.baseUrl
                    return c.redirect(`${target}?success=true&spotifyUserId=${encodeURIComponent(result.spotifyUserId)}`, 302)
                } catch (err) {
                    const redirect = deps.spotifyOAuthConnect.parseRedirectFromState(state) || deps.baseUrl
                    const errorCode = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : 'unknown'
                    return c.redirect(`${redirect}?error=${errorCode}`, 302)
                }
            }),
        ),
    )

    route.get(
        '/:accountId',
        describeRoute({
            tags: ['Spotify'],
            summary: 'Spotify 계정 상세 조회',
            responses: {
                200: {
                    description: '계정 상세',
                    content: { 'application/json': { schema: resolver(z.object({ success: z.literal(true), data: spotifyAccountResponseSchema })) } },
                },
                ...errorResponses(['UNAUTHORIZED', 'SPOTIFY_ACCOUNT_NOT_FOUND']),
            },
        }),
        validator('param', spotifyAccountParamSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const { accountId } = c.req.valid('param' as never) as z.infer<typeof spotifyAccountParamSchema>
                const account = await deps.spotifyAccountService.getById(accountId, user.id)
                return c.json(successResponse(formatAccount(account)))
            }),
        ),
    )

    route.patch(
        '/:accountId',
        describeRoute({
            tags: ['Spotify'],
            summary: 'Spotify 계정 수정',
            responses: {
                200: { description: '수정 완료' },
                ...errorResponses(['UNAUTHORIZED', 'SPOTIFY_ACCOUNT_NOT_FOUND']),
            },
        }),
        validator('param', spotifyAccountParamSchema),
        validator('json', spotifyAccountUpdateSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const { accountId } = c.req.valid('param' as never) as z.infer<typeof spotifyAccountParamSchema>
                const body = c.req.valid('json' as never) as z.infer<typeof spotifyAccountUpdateSchema>
                await deps.spotifyAccountService.update(accountId, user.id, body)
                return c.json(successResponse({ updated: true }))
            }),
        ),
    )

    route.delete(
        '/:accountId',
        describeRoute({
            tags: ['Spotify'],
            summary: 'Spotify 계정 삭제',
            responses: {
                200: { description: '삭제 완료' },
                ...errorResponses(['UNAUTHORIZED', 'SPOTIFY_ACCOUNT_NOT_FOUND']),
            },
        }),
        validator('param', spotifyAccountParamSchema),
        withErrorHandling(
            withAuth({ getSession: deps.getSession })(async (c, user) => {
                const { accountId } = c.req.valid('param' as never) as z.infer<typeof spotifyAccountParamSchema>
                await deps.spotifyAccountService.remove(accountId, user.id)
                return c.json(successResponse({ deleted: true }))
            }),
        ),
    )

    return route
}
