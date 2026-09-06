import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createAiModelRoute } from '../../../route/ai/model'
import type { AiModel } from '../../../db/schema'

const buildModel = (overrides: Partial<AiModel> = {}): AiModel => ({
    id: 1,
    providerId: 7,
    modelId: 'claude-opus-4',
    displayName: 'Claude Opus 4',
    metadata: null,
    fetchedAt: new Date('2026-05-01T00:00:00.000Z'),
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
})

const createMockDeps = (rows: AiModel[] = [buildModel()]) => ({
    aiModelService: {
        listCached: mock(async () => rows),
        refresh: mock(async () => rows),
    },
    getSession: mock(async () => ({ user: { id: 'user-1', role: null as string | null } })),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/ai', createAiModelRoute(deps as unknown as Parameters<typeof createAiModelRoute>[0]))
    return { app, deps }
}

describe('GET /ai/:provider/models', () => {
    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(async () => null as never)
        const { app } = createApp(deps)
        expect((await app.request('/ai/anthropic/models')).status).toBe(401)
    })

    test('알 수 없는 프로바이더면 AI_PROVIDER_NOT_FOUND(404)를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/ai/unknown/models')
        expect(res.status).toBe(404)
        expect((await res.json()).error.code).toBe('AI_PROVIDER_NOT_FOUND')
    })

    test('캐시된 모델 목록을 반환한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/ai/anthropic/models')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data).toEqual([
            {
                id: 1,
                providerId: 7,
                modelId: 'claude-opus-4',
                displayName: 'Claude Opus 4',
                metadata: null,
                fetchedAt: '2026-05-01T00:00:00.000Z',
            },
        ])
        expect(deps.aiModelService.listCached).toHaveBeenCalledWith('user-1', 'anthropic')
    })

    test('displayName 이 없으면 modelId 를 대신 내려준다(소비자 strict 스키마 대응)', async () => {
        const { app } = createApp(createMockDeps([buildModel({ displayName: null })]))
        const body = await (await app.request('/ai/anthropic/models')).json()
        expect(body.data[0].displayName).toBe('claude-opus-4')
    })
})

describe('POST /ai/:provider/models/refresh', () => {
    test('refresh 결과를 반환하고 displayName 폴백을 적용한다', async () => {
        const deps = createMockDeps([buildModel({ displayName: null, modelId: 'gpt-5.4' })])
        const { app } = createApp(deps)
        const res = await app.request('/ai/codex/models/refresh', { method: 'POST' })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data[0].displayName).toBe('gpt-5.4')
        expect(deps.aiModelService.refresh).toHaveBeenCalledWith('user-1', 'codex')
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(async () => null as never)
        const { app } = createApp(deps)
        expect((await app.request('/ai/codex/models/refresh', { method: 'POST' })).status).toBe(401)
    })
})
