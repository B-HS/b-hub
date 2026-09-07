import { afterEach, describe, expect, mock, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/mysql-proxy'
import * as schema from '../../db/schema'
import { composeShared } from '../../compose/shared'

type ComposeSharedArgs = Parameters<typeof composeShared>[0]

const originalFetch = globalThis.fetch

const createComposed = (refreshTokenRows: unknown[][]) => {
    const queries: { sql: string; params: unknown[] }[] = []
    const db = drizzle(
        async (sql, params) => {
            queries.push({ sql, params })
            return { rows: refreshTokenRows }
        },
        { schema, mode: 'default' },
    ) as unknown as ComposeSharedArgs['db']

    const composed = composeShared({
        db,
        env: {
            BASE_URL: 'http://localhost:9999',
            BETTER_AUTH_SECRET: 'test-secret',
            GOOGLE_CLIENT_ID: 'gid',
            GOOGLE_CLIENT_SECRET: 'gsecret',
            NODE_ENV: 'test',
        } as unknown as ComposeSharedArgs['env'],
    })

    return { composed, queries }
}

const tokenResponse = (accessToken: string, expiresIn?: number) =>
    new Response(JSON.stringify(expiresIn === undefined ? { access_token: accessToken } : { access_token: accessToken, expires_in: expiresIn }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })

afterEach(() => {
    globalThis.fetch = originalFetch
})

describe('composeShared.getGdriveAccessToken', () => {
    test('expires_in 이 남아 있으면 두 번째 호출은 refresh 없이 같은 토큰을 반환한다', async () => {
        const { composed, queries } = createComposed([['rt-1']])
        const fetchMock = mock(async () => tokenResponse('at-1', 3600))
        globalThis.fetch = fetchMock as unknown as typeof fetch

        expect(await composed.getGdriveAccessToken()).toBe('at-1')
        expect(await composed.getGdriveAccessToken()).toBe('at-1')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(queries).toHaveLength(1)
    })

    test('expires_in 이 만료 여유(60초)보다 짧으면 캐시하지 않고 매번 refresh 한다', async () => {
        const { composed } = createComposed([['rt-1']])
        const fetchMock = mock(async () => tokenResponse('at-short', 30))
        globalThis.fetch = fetchMock as unknown as typeof fetch

        expect(await composed.getGdriveAccessToken()).toBe('at-short')
        expect(await composed.getGdriveAccessToken()).toBe('at-short')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    test('expires_in 이 없으면 캐시하지 않는다', async () => {
        const { composed } = createComposed([['rt-1']])
        const fetchMock = mock(async () => tokenResponse('at-no-expiry'))
        globalThis.fetch = fetchMock as unknown as typeof fetch

        expect(await composed.getGdriveAccessToken()).toBe('at-no-expiry')
        expect(await composed.getGdriveAccessToken()).toBe('at-no-expiry')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    test('refresh token 이 없으면 null 을 반환하고 캐시하지 않는다', async () => {
        const { composed } = createComposed([])
        const fetchMock = mock(async () => tokenResponse('never', 3600))
        globalThis.fetch = fetchMock as unknown as typeof fetch

        expect(await composed.getGdriveAccessToken()).toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    test('토큰 엔드포인트가 실패하면 null 을 반환하고 다음 호출에서 다시 시도한다', async () => {
        const { composed } = createComposed([['rt-1']])
        const fetchMock = mock(async () => new Response('bad', { status: 400 }))
        globalThis.fetch = fetchMock as unknown as typeof fetch

        expect(await composed.getGdriveAccessToken()).toBeNull()
        expect(await composed.getGdriveAccessToken()).toBeNull()
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    test('GOOGLE 자격증명이 없으면 DB 조회 없이 null 을 반환한다', async () => {
        const queries: { sql: string }[] = []
        const db = drizzle(
            async (sql) => {
                queries.push({ sql })
                return { rows: [] }
            },
            { schema, mode: 'default' },
        ) as unknown as ComposeSharedArgs['db']
        const composed = composeShared({
            db,
            env: { BASE_URL: 'http://localhost:9999', NODE_ENV: 'test' } as unknown as ComposeSharedArgs['env'],
        })

        expect(await composed.getGdriveAccessToken()).toBeNull()
        expect(queries).toHaveLength(0)
    })
})
