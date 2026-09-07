import { describe, expect, test, mock, afterEach } from 'bun:test'
import { composeAi } from '../../compose/ai'
import { createCredentialCrypto } from '../../lib/credential-crypto'

const ENCRYPTION_KEY = 'a'.repeat(32)
const HISTORY_LIMIT = 50
const PAGE_LIMIT = 20

const base64url = (obj: Record<string, unknown>) => Buffer.from(JSON.stringify(obj)).toString('base64url')

const buildJwt = (payload: Record<string, unknown>) => `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(payload)}.sig`

const nowSec = () => Math.floor(Date.now() / 1000)

const buildProviderRow = (credentials: string) => ({
    id: 42,
    userId: 'user-1',
    provider: 'codex',
    authType: 'oauth',
    credentials,
    status: 'active',
    statusDetail: null,
    displayName: null,
    lastUsedAt: null,
    lastRefreshedAt: null,
    modelsFetchedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
})

const buildSessionRow = () => ({
    id: 'sess-1',
    userId: 'user-1',
    providerId: 42,
    provider: 'codex',
    modelId: 'gpt-5.1-codex',
    title: null,
    featureKey: null,
    promptIds: null,
    lastMessageAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
})

type FakeDbCaptures = { orderBy: unknown[][]; updates: Record<string, unknown>[] }

const createFakeDb = (results: unknown[][]) => {
    const queue = [...results]
    const captures: FakeDbCaptures = { orderBy: [], updates: [] }

    const shift = () => queue.shift() ?? []

    const selectChain: Record<string, unknown> = {
        from: () => selectChain,
        where: () => selectChain,
        orderBy: (...args: unknown[]) => {
            captures.orderBy.push(args)
            return selectChain
        },
        limit: () => selectChain,
        offset: () => selectChain,
        then: (resolve: (rows: unknown[]) => void) => resolve(shift()),
    }

    const updateChain = {
        set: (values: Record<string, unknown>) => {
            captures.updates.push(values)
            return updateChain
        },
        where: () => Promise.resolve(undefined),
    }

    return { db: { select: () => selectChain, update: () => updateChain }, captures }
}

const createComposed = (results: unknown[][]) => {
    const { db, captures } = createFakeDb(results)
    const composed = composeAi({
        db,
        env: { AI_ENCRYPTION_KEY: ENCRYPTION_KEY },
        storageService: { upload: mock(async () => {}), del: mock(async () => {}), getUrl: (key: string) => key, getObject: mock(async () => null) },
        logEventService: { ingest: mock(async () => ({ id: 'log-1' })) },
    } as never) as ReturnType<typeof composeAi> & Record<string, never>
    return { composed, captures }
}

const orderByColumnNames = (args: unknown[]) =>
    args.map((arg) => {
        if (arg && typeof arg === 'object' && 'name' in arg) return (arg as { name: string }).name
        const chunks = (arg as { queryChunks?: unknown[] })?.queryChunks ?? []
        const column = chunks.find((chunk) => !!chunk && typeof chunk === 'object' && 'name' in (chunk as object))
        return column ? (column as { name: string }).name : null
    })

type DeferredCaptures = { events: string[]; release: () => void }

const createDeferredDb = (results: unknown[][]) => {
    const queue = [...results]
    const captures: DeferredCaptures = { events: [], release: () => {} }
    const pending: (() => void)[] = []

    const selectChain: Record<string, unknown> = {
        from: () => selectChain,
        where: () => selectChain,
        orderBy: () => selectChain,
        limit: () => selectChain,
        offset: () => selectChain,
        then: (resolve: (rows: unknown[]) => void) => {
            const index = pending.length + captures.events.filter((event) => event.startsWith('resolve')).length
            captures.events.push(`start:${index}`)
            const rows = queue.shift() ?? []
            pending.push(() => {
                captures.events.push(`resolve:${index}`)
                resolve(rows)
            })
        },
    }

    captures.release = () => {
        const ready = pending.splice(0, pending.length)
        ready.forEach((run) => run())
    }

    return { db: { select: () => selectChain }, captures }
}

const createDeferredComposed = (results: unknown[][]) => {
    const { db, captures } = createDeferredDb(results)
    const composed = composeAi({
        db,
        env: { AI_ENCRYPTION_KEY: ENCRYPTION_KEY },
        storageService: { upload: mock(async () => {}), del: mock(async () => {}), getUrl: (key: string) => key, getObject: mock(async () => null) },
        logEventService: { ingest: mock(async () => ({ id: 'log-1' })) },
    } as never) as ReturnType<typeof composeAi> & Record<string, never>
    return { composed, captures }
}

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('composeAi count/select 병렬화(P-01)', () => {
    test('세션 목록은 count 와 select 를 동시에 시작하고 기존과 같은 rows·total 을 반환한다', async () => {
        const sessionRow = buildSessionRow()
        const { composed, captures } = createDeferredComposed([[{ total: 7 }], [sessionRow]])

        const pending = composed.aiSessionService!.list('user-1', { page: 1, limit: PAGE_LIMIT })
        await flushMicrotasks()
        expect(captures.events).toEqual(['start:0', 'start:1'])

        captures.release()
        const result = await pending
        expect(result.total).toBe(7)
        expect(result.rows).toEqual([sessionRow])
    })

    test('메시지 목록은 소유 검증 뒤 count 와 select 를 동시에 시작한다', async () => {
        const messageRow = { id: 3, sessionId: 'sess-1', role: 'user', content: '안녕', createdAt: new Date() }
        const { composed, captures } = createDeferredComposed([[buildSessionRow()], [{ total: 2 }], [messageRow]])

        const pending = composed.aiSessionService!.listMessages('user-1', 'sess-1', { page: 1, limit: PAGE_LIMIT })
        await flushMicrotasks()
        expect(captures.events).toEqual(['start:0'])

        captures.release()
        await flushMicrotasks()
        expect(captures.events).toEqual(['start:0', 'resolve:0', 'start:1', 'start:2'])

        captures.release()
        const result = await pending
        expect(result.total).toBe(2)
        expect(result.rows).toEqual([messageRow])
    })
})

describe('composeAi 메시지 정렬(R-18)', () => {
    test('세션 메시지 목록은 created_at 과 id 로 정렬한다', async () => {
        const { composed, captures } = createComposed([[buildSessionRow()], [{ total: 0 }], []])

        await composed.aiSessionService!.listMessages('user-1', 'sess-1', { page: 1, limit: PAGE_LIMIT })

        expect(captures.orderBy.length).toBe(1)
        expect(orderByColumnNames(captures.orderBy[0])).toEqual(['created_at', 'id'])
    })

    test('히스토리 조회는 created_at desc 와 id desc 로 정렬한다', async () => {
        const { composed, captures } = createComposed([[]])

        await composed.aiSessionService!.listRecentMessages('sess-1', HISTORY_LIMIT)

        expect(captures.orderBy.length).toBe(1)
        expect(orderByColumnNames(captures.orderBy[0])).toEqual(['created_at', 'id'])
    })
})

describe('composeAi codex 토큰 갱신 실패 분기(R-19)', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    const codexCredentials = () =>
        createCredentialCrypto(ENCRYPTION_KEY).encrypt(
            JSON.stringify({
                idToken: buildJwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-1' } }),
                accessToken: buildJwt({ exp: nowSec() + 60 }),
                refreshToken: 'rt-old',
                accountId: 'acct-1',
            }),
        )

    const refreshResponse = (status: number, body: string) => {
        const refreshFetch = mock(() => Promise.resolve(new Response(body, { status })))
        globalThis.fetch = refreshFetch as unknown as typeof fetch
        return refreshFetch
    }

    test('invalid_grant 응답이면 reauth_required 로 마킹하고 AI_REAUTH_REQUIRED 를 던진다', async () => {
        const refreshFetch = refreshResponse(400, JSON.stringify({ error: 'invalid_grant', error_description: 'expired' }))
        const { composed, captures } = createComposed([[buildProviderRow(codexCredentials())]])

        const { client } = await composed.aiConnectionService!.resolveClient('user-1', 'codex')
        await expect(client.listModels()).rejects.toMatchObject({ code: 'AI_REAUTH_REQUIRED', statusCode: 401 })

        expect(refreshFetch).toHaveBeenCalledTimes(1)
        expect(captures.updates).toEqual([expect.objectContaining({ status: 'reauth_required' })])
    })

    test('429 응답이면 마킹하지 않고 AI_TOKEN_REFRESH_FAILED 를 던진다', async () => {
        refreshResponse(429, JSON.stringify({ error: 'rate_limit_exceeded' }))
        const { composed, captures } = createComposed([[buildProviderRow(codexCredentials())]])

        const { client } = await composed.aiConnectionService!.resolveClient('user-1', 'codex')
        await expect(client.listModels()).rejects.toMatchObject({ code: 'AI_TOKEN_REFRESH_FAILED', statusCode: 502 })

        expect(captures.updates).toEqual([])
    })

    test('5xx 응답이면 마킹하지 않고 AI_TOKEN_REFRESH_FAILED 를 던진다', async () => {
        refreshResponse(503, 'upstream unavailable')
        const { composed, captures } = createComposed([[buildProviderRow(codexCredentials())]])

        const { client } = await composed.aiConnectionService!.resolveClient('user-1', 'codex')
        await expect(client.listModels()).rejects.toMatchObject({ code: 'AI_TOKEN_REFRESH_FAILED' })

        expect(captures.updates).toEqual([])
    })
})
