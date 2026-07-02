import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createAiConnectionRoute } from '../../../route/ai/connection'
import type { AiProvider } from '../../../db/schema'

const SECRET_CREDENTIALS = 'super-secret-credential-blob'

const providerRow: AiProvider = {
    id: 1,
    userId: 'user-1',
    provider: 'anthropic',
    authType: 'api_key',
    credentials: SECRET_CREDENTIALS,
    status: 'active',
    statusDetail: null,
    displayName: 'My Claude',
    lastUsedAt: null,
    lastRefreshedAt: null,
    modelsFetchedAt: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-02T00:00:00.000Z'),
}

const createMockDeps = () => ({
    aiConnectionService: {
        list: mock(async () => [providerRow]),
        connect: mock(async () => providerRow),
        update: mock(async () => providerRow),
        remove: mock(async () => undefined),
    },
    getSession: mock(async () => ({ user: { id: 'user-1', role: null as string | null } })),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/connections', createAiConnectionRoute(deps as unknown as Parameters<typeof createAiConnectionRoute>[0]))
    return { app, deps }
}

describe('GET /connections', () => {
    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(async () => null as never)
        const { app } = createApp(deps)
        const res = await app.request('/connections')
        expect(res.status).toBe(401)
    })

    test('인증되면 200과 연결 목록을 반환한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/connections')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data).toHaveLength(1)
        expect(body.data[0].id).toBe(1)
        expect(deps.aiConnectionService.list).toHaveBeenCalledWith('user-1')
    })

    test('응답에 credentials·토큰·userId가 새지 않는다', async () => {
        const { app } = createApp()
        const res = await app.request('/connections')
        const body = await res.json()
        expect(body.data[0].credentials).toBeUndefined()
        expect(body.data[0].userId).toBeUndefined()
        const serialized = JSON.stringify(body)
        expect(serialized).not.toContain(SECRET_CREDENTIALS)
        expect(serialized).not.toContain('credentials')
        expect(serialized).not.toContain('user-1')
    })
})

describe('POST /connections', () => {
    test('연결 자격증명을 받아 connect를 호출하고 200을 반환한다', async () => {
        const { app, deps } = createApp()
        const input = { provider: 'anthropic', credentials: { apiKey: 'sk-ant-value' } }
        const res = await app.request('/connections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(deps.aiConnectionService.connect).toHaveBeenCalledWith('user-1', input)
        expect(JSON.stringify(body)).not.toContain(SECRET_CREDENTIALS)
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(async () => null as never)
        const { app } = createApp(deps)
        const res = await app.request('/connections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'anthropic', credentials: { apiKey: 'k' } }),
        })
        expect(res.status).toBe(401)
    })
})

describe('PATCH /connections/:providerId', () => {
    test('수정을 반영하고 200을 반환한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/connections/1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'disabled' }),
        })
        expect(res.status).toBe(200)
        expect(deps.aiConnectionService.update).toHaveBeenCalledWith('user-1', 1, { status: 'disabled' })
    })

    test('비숫자 providerId는 AI_PROVIDER_NOT_FOUND(404)를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/connections/abc', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'active' }),
        })
        expect(res.status).toBe(404)
        const body = await res.json()
        expect(body.error.code).toBe('AI_PROVIDER_NOT_FOUND')
    })
})

describe('DELETE /connections/:providerId', () => {
    test('삭제하고 200을 반환한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/connections/1', { method: 'DELETE' })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.deleted).toBe(true)
        expect(deps.aiConnectionService.remove).toHaveBeenCalledWith('user-1', 1)
    })

    test('비숫자 providerId는 AI_PROVIDER_NOT_FOUND(404)를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/connections/abc', { method: 'DELETE' })
        expect(res.status).toBe(404)
        const body = await res.json()
        expect(body.error.code).toBe('AI_PROVIDER_NOT_FOUND')
    })
})
