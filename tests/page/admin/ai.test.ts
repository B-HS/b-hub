import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createAiProvidersRoute, createAiSessionsRoute, createAiPromptsRoute } from '../../../page/admin/pages/ai'
import { mockAdmin, mockUser, sessionOf, stubAdminDb } from './helpers'
import type { AdminSessionUser } from '../../../page/admin/guard'

const providerRow = {
    id: 3,
    userId: 'u-9',
    userEmail: 'ai-user@example.com',
    provider: 'anthropic',
    authType: 'api_key',
    status: 'active',
    statusDetail: null,
    displayName: 'My Claude Connection',
    lastUsedAt: new Date('2026-06-01'),
    lastRefreshedAt: null,
    modelsFetchedAt: new Date('2026-06-02'),
    createdAt: new Date('2026-05-01'),
}

const sessionRow = {
    id: 'sess-1',
    userId: 'u-9',
    userEmail: 'ai-user@example.com',
    provider: 'codex',
    modelId: 'gpt-5-codex',
    title: 'My chat session',
    featureKey: null,
    lastMessageAt: new Date('2026-06-03'),
    createdAt: new Date('2026-05-02'),
}

const promptRow = {
    id: 5,
    userId: 'u-9',
    userEmail: 'ai-user@example.com',
    name: 'System Base Prompt',
    stage: 'system',
    featureKey: null,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date('2026-05-03'),
}

const providersApp = (overrides: Parameters<typeof stubAdminDb>[0] = {}, user: AdminSessionUser | null = mockAdmin) => {
    const app = new Hono()
    app.route(
        '/admin/ai/providers',
        createAiProvidersRoute({
            getSession: sessionOf(user),
            adminDb: stubAdminDb({ listAiProviders: () => Promise.resolve({ rows: [providerRow], total: 1 }), ...overrides }),
        }),
    )
    return app
}

const sessionsApp = (user: AdminSessionUser | null = mockAdmin) => {
    const app = new Hono()
    app.route(
        '/admin/ai/sessions',
        createAiSessionsRoute({
            getSession: sessionOf(user),
            adminDb: stubAdminDb({ listAiSessions: () => Promise.resolve({ rows: [sessionRow], total: 1 }) }),
        }),
    )
    return app
}

const promptsApp = (user: AdminSessionUser | null = mockAdmin) => {
    const app = new Hono()
    app.route(
        '/admin/ai/prompts',
        createAiPromptsRoute({
            getSession: sessionOf(user),
            adminDb: stubAdminDb({ listAiPrompts: () => Promise.resolve({ rows: [promptRow], total: 1 }) }),
        }),
    )
    return app
}

describe('GET /admin/ai/providers (list)', () => {
    test('200과 프로바이더 정보를 노출한다', async () => {
        const res = await providersApp().request('/admin/ai/providers')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('AI Providers')
        expect(html).toContain('ai-user@example.com')
        expect(html).toContain('My Claude Connection')
        expect(html).toContain('anthropic')
    })

    test('미인증이면 로그인으로 303 리다이렉트한다', async () => {
        const res = await providersApp({}, null).request('/admin/ai/providers')
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/login')
    })

    test('비관리자면 403을 반환한다', async () => {
        const res = await providersApp({}, mockUser).request('/admin/ai/providers')
        expect(res.status).toBe(403)
    })
})

describe('POST /admin/ai/providers/:id/status', () => {
    test('setAiProviderStatus를 호출하고 flash=ok로 303 리다이렉트한다', async () => {
        const setAiProviderStatus = mock(() => Promise.resolve())
        const app = providersApp({ setAiProviderStatus })
        const res = await app.request('/admin/ai/providers/3/status', {
            method: 'POST',
            body: new URLSearchParams({ status: 'active' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/ai/providers')
        expect(res.headers.get('location')).toContain('flash=ok')
        expect(setAiProviderStatus).toHaveBeenCalledWith(3, 'active')
    })

    test('status가 active가 아니면 disabled로 넘긴다', async () => {
        const setAiProviderStatus = mock(() => Promise.resolve())
        const app = providersApp({ setAiProviderStatus })
        await app.request('/admin/ai/providers/3/status', { method: 'POST', body: new URLSearchParams({ status: 'disabled' }) })
        expect(setAiProviderStatus).toHaveBeenCalledWith(3, 'disabled')
    })

    test('id 0은 setAiProviderStatus를 호출하지 않지만 303 리다이렉트한다', async () => {
        const setAiProviderStatus = mock(() => Promise.resolve())
        const app = providersApp({ setAiProviderStatus })
        const res = await app.request('/admin/ai/providers/0/status', { method: 'POST', body: new URLSearchParams({ status: 'active' }) })
        expect(res.status).toBe(303)
        expect(setAiProviderStatus).not.toHaveBeenCalled()
    })
})

describe('POST /admin/ai/providers/:id/delete', () => {
    test('deleteAiProvider를 호출하고 303 리다이렉트한다', async () => {
        const deleteAiProvider = mock(() => Promise.resolve())
        const app = providersApp({ deleteAiProvider })
        const res = await app.request('/admin/ai/providers/3/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('flash=ok')
        expect(deleteAiProvider).toHaveBeenCalledWith(3)
    })

    test('외부 도메인 returnTo는 무시되고 기본 경로로 폴백된다', async () => {
        const app = providersApp()
        const res = await app.request('/admin/ai/providers/3/delete', { method: 'POST', body: new URLSearchParams({ returnTo: 'https://evil.com' }) })
        const location = res.headers.get('location') ?? ''
        expect(location).not.toContain('evil.com')
        expect(location).toContain('/admin/ai/providers')
    })
})

describe('GET /admin/ai/sessions (list)', () => {
    test('200과 세션 정보를 노출한다', async () => {
        const res = await sessionsApp().request('/admin/ai/sessions')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('AI Sessions')
        expect(html).toContain('gpt-5-codex')
        expect(html).toContain('My chat session')
    })

    test('미인증이면 303 리다이렉트한다', async () => {
        const res = await sessionsApp(null).request('/admin/ai/sessions')
        expect(res.status).toBe(303)
    })
})

describe('GET /admin/ai/prompts (list)', () => {
    test('200과 프롬프트 정보를 노출한다', async () => {
        const res = await promptsApp().request('/admin/ai/prompts')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('AI Prompts')
        expect(html).toContain('System Base Prompt')
        expect(html).toContain('system')
    })

    test('비관리자면 403을 반환한다', async () => {
        const res = await promptsApp(mockUser).request('/admin/ai/prompts')
        expect(res.status).toBe(403)
    })
})
