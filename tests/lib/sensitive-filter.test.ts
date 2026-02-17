import { describe, expect, test } from 'bun:test'
import { isSensitiveKey, filterSensitiveData } from '../../lib/sensitive-filter'

describe('isSensitiveKey', () => {
    test('password → true', () => {
        expect(isSensitiveKey('password')).toBe(true)
    })

    test('token → true', () => {
        expect(isSensitiveKey('token')).toBe(true)
    })

    test('secret → true', () => {
        expect(isSensitiveKey('secret')).toBe(true)
    })

    test('api_key → true', () => {
        expect(isSensitiveKey('api_key')).toBe(true)
    })

    test('authorization → true', () => {
        expect(isSensitiveKey('authorization')).toBe(true)
    })

    test('username → false', () => {
        expect(isSensitiveKey('username')).toBe(false)
    })

    test('email → false', () => {
        expect(isSensitiveKey('email')).toBe(false)
    })

    test('대소문자 무시: PASSWORD → true', () => {
        expect(isSensitiveKey('PASSWORD')).toBe(true)
    })

    test('대소문자 무시: Api_Token → true', () => {
        expect(isSensitiveKey('Api_Token')).toBe(true)
    })

    test('포함 검사: mySecretValue → true', () => {
        expect(isSensitiveKey('mySecretValue')).toBe(true)
    })
})

describe('filterSensitiveData', () => {
    test('null → null', () => {
        expect(filterSensitiveData(null)).toBeNull()
    })

    test('민감 키를 [REDACTED]로 치환', () => {
        const result = filterSensitiveData({
            username: 'john',
            password: '12345',
            api_key: 'abc',
        })
        expect(result).toEqual({
            username: 'john',
            password: '[REDACTED]',
            api_key: '[REDACTED]',
        })
    })

    test('민감 키가 없으면 원본 유지', () => {
        const data = { name: 'test', value: '123' }
        expect(filterSensitiveData(data)).toEqual(data)
    })

    test('빈 객체 → 빈 객체', () => {
        expect(filterSensitiveData({})).toEqual({})
    })
})
