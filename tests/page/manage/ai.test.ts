import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createManageAiProvidersRoute } from '../../../page/manage/pages/ai'
import { createAppError } from '../../../lib/error'
import type { AiProvider } from '../../../db/schema'
import type { AiConnectionService } from '../../../service/domain/ai/ai-connection'
import { mockUser, sessionOf, stubAiConnectionService } from './helpers'

const sampleRow: AiProvider = {
    id: 1,
    userId: 'u1',
    provider: 'anthropic',
    authType: 'apikey',
    credentials: 'encrypted-secret-blob',
    status: 'active',
    statusDetail: null,
    displayName: '개인 Anthropic',
    lastUsedAt: null,
    lastRefreshedAt: null,
    modelsFetchedAt: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
}

const createApp = (overrides: Partial<AiConnectionService> = {}) => {
    const app = new Hono()
    app.route(
        '/manage/ai/providers',
        createManageAiProvidersRoute({ getSession: sessionOf(mockUser), aiConnectionService: stubAiConnectionService(overrides) }),
    )
    return app
}

describe('GET /manage/ai/providers', () => {
    test('연결 목록에 표시명·상태를 보여주고 자격증명은 노출하지 않는다', async () => {
        const res = await createApp({ list: () => Promise.resolve([sampleRow]) }).request('/manage/ai/providers')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('개인 Anthropic')
        expect(html).toContain('active')
        expect(html).not.toContain('encrypted-secret-blob')
    })

    test('reauth_required 상태는 destructive 배지로 표시된다', async () => {
        const res = await createApp({
            list: () => Promise.resolve([{ ...sampleRow, provider: 'codex', authType: 'oauth', status: 'reauth_required' }]),
        }).request('/manage/ai/providers')
        const html = await res.text()
        expect(html).toContain('reauth_required')
        expect(html).toContain('badge destructive')
    })

    test('3개 프로바이더 옵션이 셀렉트에 렌더링된다', async () => {
        const res = await createApp().request('/manage/ai/providers')
        const html = await res.text()
        for (const p of ['codex', 'anthropic', 'ollama']) expect(html).toContain(`value="${p}"`)
    })

    test('자격증명 입력은 password 타입이다', async () => {
        const res = await createApp().request('/manage/ai/providers')
        const html = await res.text()
        for (const name of ['apiKey', 'idToken', 'accessToken', 'refreshToken']) expect(html).toContain(`type="password" name="${name}"`)
    })

    test('aiConnectionService 미구성이면 안내를 보여준다', async () => {
        const app = new Hono()
        app.route('/manage/ai/providers', createManageAiProvidersRoute({ getSession: sessionOf(mockUser), aiConnectionService: undefined }))
        const res = await app.request('/manage/ai/providers')
        expect(res.status).toBe(200)
        expect(await res.text()).toContain('구성되지 않았습니다')
    })
})

describe('POST /manage/ai/providers', () => {
    test('anthropic은 apiKey 자격증명으로 connect를 호출하고 flash=ok로 리다이렉트한다', async () => {
        const connect = mock(() => Promise.resolve(sampleRow))
        const res = await createApp({ connect }).request('/manage/ai/providers', {
            method: 'POST',
            body: new URLSearchParams({ provider: 'anthropic', displayName: '개인 Anthropic', apiKey: 'sk-ant-secret' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/manage/ai/providers?flash=ok')
        expect(connect).toHaveBeenCalledTimes(1)
        expect(connect.mock.calls[0][0]).toBe('u1')
        expect(connect.mock.calls[0][1]).toEqual({
            provider: 'anthropic',
            displayName: '개인 Anthropic',
            credentials: { apiKey: 'sk-ant-secret' },
        })
    })

    test('codex는 idToken·accessToken·refreshToken 자격증명으로 connect를 호출한다', async () => {
        const connect = mock(() => Promise.resolve({ ...sampleRow, provider: 'codex', authType: 'oauth' }))
        const res = await createApp({ connect }).request('/manage/ai/providers', {
            method: 'POST',
            body: new URLSearchParams({ provider: 'codex', idToken: 'id-t', accessToken: 'acc-t', refreshToken: 'ref-t' }),
        })
        expect(res.headers.get('location')).toBe('/manage/ai/providers?flash=ok')
        expect(connect.mock.calls[0][1]).toEqual({
            provider: 'codex',
            displayName: undefined,
            credentials: { idToken: 'id-t', accessToken: 'acc-t', refreshToken: 'ref-t', accountId: undefined },
        })
    })

    test('codex인데 토큰이 없으면 검증 실패로 connect를 호출하지 않는다', async () => {
        const connect = mock(() => Promise.resolve(sampleRow))
        const res = await createApp({ connect }).request('/manage/ai/providers', {
            method: 'POST',
            body: new URLSearchParams({ provider: 'codex', apiKey: 'ignored' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('code=validation')
        expect(connect).not.toHaveBeenCalled()
    })

    test('AI_CREDENTIALS_INVALID 에러는 ai_credentials_invalid 코드로 리다이렉트한다', async () => {
        const app = createApp({ connect: () => Promise.reject(createAppError('AI_CREDENTIALS_INVALID')) })
        const res = await app.request('/manage/ai/providers', {
            method: 'POST',
            body: new URLSearchParams({ provider: 'ollama', apiKey: 'x' }),
        })
        expect(res.headers.get('location')).toContain('code=ai_credentials_invalid')
    })
})

describe('POST /manage/ai/providers/:id/delete', () => {
    test('remove를 호출하고 flash=ok로 리다이렉트한다', async () => {
        const remove = mock(() => Promise.resolve())
        const res = await createApp({ remove }).request('/manage/ai/providers/1/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/manage/ai/providers?flash=ok')
        expect(remove).toHaveBeenCalledWith('u1', 1)
    })

    test('존재하지 않으면 not_found 코드로 리다이렉트한다', async () => {
        const app = createApp({ remove: () => Promise.reject(createAppError('AI_PROVIDER_NOT_FOUND')) })
        const res = await app.request('/manage/ai/providers/99/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.headers.get('location')).toContain('code=not_found')
    })

    test('숫자가 아닌 id는 not_found 코드로 리다이렉트한다', async () => {
        const remove = mock(() => Promise.resolve())
        const res = await createApp({ remove }).request('/manage/ai/providers/abc/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.headers.get('location')).toContain('code=not_found')
        expect(remove).not.toHaveBeenCalled()
    })
})
