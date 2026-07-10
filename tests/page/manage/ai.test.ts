import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createManageAiKeysRoute } from '../../../page/manage/pages/ai'
import { createAppError } from '../../../lib/error'
import type { AiService } from '../../../service/domain/ai/ai'
import { mockUser, sessionOf, stubAiService } from './helpers'

const sampleKey = {
    id: 'k1',
    provider: 'openai' as const,
    label: '개인 OpenAI',
    credentialMasked: '****abcd',
    baseUrl: null,
    defaultModel: 'gpt-4o-mini',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
}

const createApp = (overrides: Partial<AiService> = {}) => {
    const app = new Hono()
    app.route('/manage/ai/keys', createManageAiKeysRoute({ getSession: sessionOf(mockUser), aiService: stubAiService(overrides) }))
    return app
}

describe('GET /manage/ai/keys', () => {
    test('마스킹된 크리덴셜과 라벨을 보여준다', async () => {
        const res = await createApp({ listKeys: () => Promise.resolve([sampleKey]) }).request('/manage/ai/keys')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('개인 OpenAI')
        expect(html).toContain('****abcd')
    })

    test('4개 프로바이더 옵션이 셀렉트에 렌더링된다', async () => {
        const res = await createApp().request('/manage/ai/keys')
        const html = await res.text()
        for (const p of ['omlx', 'openai', 'ollama_cloud', 'anthropic']) expect(html).toContain(`value="${p}"`)
    })

    test('credential 입력은 password 타입이다', async () => {
        const res = await createApp().request('/manage/ai/keys')
        const html = await res.text()
        expect(html).toContain('type="password"')
    })

    test('aiService 미구성이면 안내를 보여준다', async () => {
        const app = new Hono()
        app.route('/manage/ai/keys', createManageAiKeysRoute({ getSession: sessionOf(mockUser), aiService: undefined }))
        const res = await app.request('/manage/ai/keys')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('구성되지 않았습니다')
    })
})

describe('POST /manage/ai/keys', () => {
    test('유효 입력이면 addKey를 호출하고 flash=ok로 리다이렉트한다', async () => {
        const addKey = mock(() => Promise.resolve({ ...sampleKey, credentialMasked: '****wxyz' }))
        const app = createApp({ addKey })
        const res = await app.request('/manage/ai/keys', {
            method: 'POST',
            body: new URLSearchParams({ provider: 'openai', label: 'k', credential: 'sk-secret', defaultModel: 'gpt-4o' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/manage/ai/keys?flash=ok')
        expect(addKey).toHaveBeenCalledTimes(1)
        expect(addKey.mock.calls[0][1]).toMatchObject({ provider: 'openai', label: 'k', credential: 'sk-secret', defaultModel: 'gpt-4o' })
    })

    test('omlx인데 baseUrl이 없으면 검증 실패로 addKey를 호출하지 않는다', async () => {
        const addKey = mock(() => Promise.resolve(sampleKey))
        const app = createApp({ addKey })
        const res = await app.request('/manage/ai/keys', {
            method: 'POST',
            body: new URLSearchParams({ provider: 'omlx', label: 'k', credential: 'x' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('code=validation')
        expect(addKey).not.toHaveBeenCalled()
    })

    test('빈 baseUrl 문자열은 undefined로 처리되어 openai 등록이 통과한다', async () => {
        const addKey = mock(() => Promise.resolve(sampleKey))
        const app = createApp({ addKey })
        const res = await app.request('/manage/ai/keys', {
            method: 'POST',
            body: new URLSearchParams({ provider: 'openai', label: 'k', credential: 'x', baseUrl: '' }),
        })
        expect(res.headers.get('location')).toBe('/manage/ai/keys?flash=ok')
        expect(addKey.mock.calls[0][1].baseUrl).toBeUndefined()
    })

    test('AI_KEY_LIMIT 에러는 ai_key_limit 코드로 리다이렉트한다', async () => {
        const app = createApp({ addKey: () => Promise.reject(createAppError('AI_KEY_LIMIT')) })
        const res = await app.request('/manage/ai/keys', {
            method: 'POST',
            body: new URLSearchParams({ provider: 'openai', label: 'k', credential: 'x' }),
        })
        expect(res.headers.get('location')).toContain('code=ai_key_limit')
    })
})

describe('POST /manage/ai/keys/:id/delete', () => {
    test('deleteKey를 호출하고 flash=ok로 리다이렉트한다', async () => {
        const deleteKey = mock(() => Promise.resolve({ deleted: true }))
        const app = createApp({ deleteKey })
        const res = await app.request('/manage/ai/keys/k1/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/manage/ai/keys?flash=ok')
        expect(deleteKey).toHaveBeenCalledWith('u1', 'k1')
    })

    test('존재하지 않으면 not_found 코드로 리다이렉트한다', async () => {
        const app = createApp({ deleteKey: () => Promise.resolve({ deleted: false }) })
        const res = await app.request('/manage/ai/keys/nope/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.headers.get('location')).toContain('code=not_found')
    })
})
