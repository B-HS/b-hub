import { describe, expect, test } from 'bun:test'
import { base64urlEncode, base64urlDecode, hmacSign, hmacVerify, createOAuthState, verifyOAuthState, parseStatePayload } from '../../lib/hmac-state'

describe('hmac-state', () => {
    describe('base64urlEncode / base64urlDecode', () => {
        test('인코딩/디코딩 왕복이 동일하다', () => {
            const original = '{"userId":"user-1","exp":1234567890}'
            const encoded = base64urlEncode(original)
            const decoded = base64urlDecode(encoded)
            expect(decoded).toBe(original)
        })

        test('빈 문자열을 처리한다', () => {
            const encoded = base64urlEncode('')
            const decoded = base64urlDecode(encoded)
            expect(decoded).toBe('')
        })
    })

    describe('hmacSign / hmacVerify', () => {
        test('서명을 생성하고 검증한다', async () => {
            const payload = 'test-payload'
            const secret = 'test-secret'
            const sig = await hmacSign(payload, secret)
            expect(sig).toBeTruthy()
            expect(await hmacVerify(payload, sig, secret)).toBe(true)
        })

        test('다른 payload는 검증 실패한다', async () => {
            const secret = 'test-secret'
            const sig = await hmacSign('payload-a', secret)
            expect(await hmacVerify('payload-b', sig, secret)).toBe(false)
        })

        test('다른 secret은 검증 실패한다', async () => {
            const payload = 'test-payload'
            const sig = await hmacSign(payload, 'secret-a')
            expect(await hmacVerify(payload, sig, 'secret-b')).toBe(false)
        })
    })

    describe('createOAuthState / verifyOAuthState', () => {
        test('state를 생성하고 검증한다', async () => {
            const secret = 'test-secret'
            const state = await createOAuthState({ userId: 'user-1' }, secret, 60_000)
            const data = await verifyOAuthState<{ userId: string }>(state, secret)
            expect(data.userId).toBe('user-1')
            expect(data.exp).toBeGreaterThan(Date.now())
        })

        test('만료된 state는 에러를 발생시킨다', async () => {
            const secret = 'test-secret'
            const state = await createOAuthState({ userId: 'user-1' }, secret, -1000)
            await expect(verifyOAuthState(state, secret)).rejects.toThrow('State expired')
        })

        test('변조된 state는 에러를 발생시킨다', async () => {
            const secret = 'test-secret'
            const state = await createOAuthState({ userId: 'user-1' }, secret, 60_000)
            const tampered = state.replace(state[0], state[0] === 'a' ? 'b' : 'a')
            await expect(verifyOAuthState(tampered, secret)).rejects.toThrow()
        })

        test('userId가 payload에 포함된다', async () => {
            const secret = 'test-secret'
            const state = await createOAuthState({ userId: 'user-42' }, secret, 60_000)
            const data = await verifyOAuthState<{ userId: string }>(state, secret)
            expect(data.userId).toBe('user-42')
        })
    })

    describe('parseStatePayload', () => {
        test('payload를 파싱한다', async () => {
            const secret = 'test-secret'
            const state = await createOAuthState({ userId: 'user-1', redirect: '/dashboard' }, secret, 60_000)
            const data = parseStatePayload<{ userId: string; redirect: string }>(state)
            expect(data?.userId).toBe('user-1')
            expect(data?.redirect).toBe('/dashboard')
        })

        test('잘못된 state는 null을 반환한다', () => {
            expect(parseStatePayload('invalid')).toBeNull()
            expect(parseStatePayload('')).toBeNull()
        })
    })
})
