import { describe, expect, test } from 'bun:test'
import { aiProviderCreateSchema, aiProviderUpdateSchema } from '../../../dto/ai/provider'

describe('aiProviderCreateSchema', () => {
    test('codex는 idToken·accessToken·refreshToken 자격증명을 파싱한다', () => {
        const r = aiProviderCreateSchema.parse({
            provider: 'codex',
            credentials: { idToken: 'id-tok', accessToken: 'acc-tok', refreshToken: 'ref-tok' },
        })
        expect(r.provider).toBe('codex')
        expect(r.credentials).toEqual({ idToken: 'id-tok', accessToken: 'acc-tok', refreshToken: 'ref-tok' })
    })

    test('codex는 accessToken 단독(token 방식)을 파싱한다', () => {
        const r = aiProviderCreateSchema.parse({ provider: 'codex', credentials: { accessToken: 'acc-tok' } })
        expect(r.credentials).toEqual({ accessToken: 'acc-tok' })
    })

    test('codex는 accessToken+accountId(token 방식)를 파싱한다', () => {
        const r = aiProviderCreateSchema.parse({ provider: 'codex', credentials: { accessToken: 'acc-tok', accountId: 'acct-1' } })
        expect(r.credentials).toEqual({ accessToken: 'acc-tok', accountId: 'acct-1' })
    })

    test('codex에 refreshToken이 없으면 token 방식으로 파싱되고 idToken은 버려진다', () => {
        const r = aiProviderCreateSchema.parse({ provider: 'codex', credentials: { idToken: 'a', accessToken: 'b' } })
        expect(r.credentials).toEqual({ accessToken: 'b' })
    })

    test('codex에 accessToken이 없으면 실패한다', () => {
        expect(() => aiProviderCreateSchema.parse({ provider: 'codex', credentials: { idToken: 'a', refreshToken: 'r' } })).toThrow()
    })

    test('codex에 apiKey만 주면 실패한다', () => {
        expect(() => aiProviderCreateSchema.parse({ provider: 'codex', credentials: { apiKey: 'k' } })).toThrow()
    })

    test('anthropic은 apiKey 자격증명을 파싱한다', () => {
        const r = aiProviderCreateSchema.parse({ provider: 'anthropic', credentials: { apiKey: 'sk-ant' } })
        expect(r.provider).toBe('anthropic')
        expect(r.credentials).toEqual({ apiKey: 'sk-ant' })
    })

    test('ollama는 apiKey 자격증명을 파싱한다', () => {
        const r = aiProviderCreateSchema.parse({ provider: 'ollama', credentials: { apiKey: 'local' } })
        expect(r.provider).toBe('ollama')
    })

    test('anthropic에 apiKey가 없으면 실패한다', () => {
        expect(() => aiProviderCreateSchema.parse({ provider: 'anthropic', credentials: { idToken: 'x' } })).toThrow()
    })

    test('displayName은 선택이며 max 100을 초과하면 실패한다', () => {
        const r = aiProviderCreateSchema.parse({ provider: 'anthropic', displayName: 'My Claude', credentials: { apiKey: 'k' } })
        expect(r.displayName).toBe('My Claude')
        expect(() => aiProviderCreateSchema.parse({ provider: 'anthropic', displayName: 'a'.repeat(101), credentials: { apiKey: 'k' } })).toThrow()
    })

    test('알 수 없는 provider 값은 실패한다', () => {
        expect(() => aiProviderCreateSchema.parse({ provider: 'openai', credentials: { apiKey: 'k' } })).toThrow()
    })
})

describe('aiProviderUpdateSchema', () => {
    test('status active를 허용한다', () => {
        expect(aiProviderUpdateSchema.parse({ status: 'active' }).status).toBe('active')
    })

    test('status disabled를 허용한다', () => {
        expect(aiProviderUpdateSchema.parse({ status: 'disabled' }).status).toBe('disabled')
    })

    test('status reauth_required는 실패한다', () => {
        expect(aiProviderUpdateSchema.safeParse({ status: 'reauth_required' }).success).toBe(false)
    })

    test('빈 객체는 허용한다(모두 선택)', () => {
        expect(aiProviderUpdateSchema.safeParse({}).success).toBe(true)
    })
})
