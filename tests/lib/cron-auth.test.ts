import { describe, expect, test } from 'bun:test'
import { isSecretMatch, verifyCronAuth } from '../../lib/cron-auth'

const createContext = (headers: Record<string, string>) => ({
    req: { header: (name: string) => headers[name] },
})

describe('isSecretMatch', () => {
    test('같은 값이면 true 를 반환한다', () => {
        expect(isSecretMatch('super-secret', 'super-secret')).toBe(true)
    })

    test('길이가 같고 값이 다르면 false 를 반환한다', () => {
        expect(isSecretMatch('super-secret', 'super-secreT')).toBe(false)
    })

    test('길이가 다르면 false 를 반환한다', () => {
        expect(isSecretMatch('short', 'super-secret')).toBe(false)
    })

    test('제공값이 비어 있으면 false 를 반환한다', () => {
        expect(isSecretMatch('', 'super-secret')).toBe(false)
    })

    test('기대값이 비어 있으면 false 를 반환한다', () => {
        expect(isSecretMatch('super-secret', '')).toBe(false)
    })

    test('양쪽이 모두 비어 있어도 false 를 반환한다', () => {
        expect(isSecretMatch('', '')).toBe(false)
    })
})

describe('verifyCronAuth', () => {
    test('Bearer 토큰이 일치하면 통과한다', () => {
        expect(() => verifyCronAuth(createContext({ Authorization: 'Bearer cron-secret' }), 'cron-secret')).not.toThrow()
    })

    test('x-cron-secret 헤더가 일치하면 통과한다', () => {
        expect(() => verifyCronAuth(createContext({ 'x-cron-secret': 'cron-secret' }), 'cron-secret')).not.toThrow()
    })

    test('헤더가 없으면 UNAUTHORIZED 를 던진다', () => {
        expect(() => verifyCronAuth(createContext({}), 'cron-secret')).toThrow()
    })

    test('토큰이 틀리면 UNAUTHORIZED 를 던진다', () => {
        try {
            verifyCronAuth(createContext({ Authorization: 'Bearer wrong-secrets' }), 'cron-secret')
            expect.unreachable()
        } catch (error) {
            expect(error).toMatchObject({ code: 'UNAUTHORIZED' })
        }
    })

    test('시크릿이 설정되지 않았으면 올바른 헤더여도 UNAUTHORIZED 를 던진다', () => {
        expect(() => verifyCronAuth(createContext({ Authorization: 'Bearer ' }), '')).toThrow()
        expect(() => verifyCronAuth(createContext({ 'x-cron-secret': 'anything' }), '')).toThrow()
    })
})
