import { describe, expect, test } from 'bun:test'
import { generateToken, hashToken } from '../../lib/token-utils'

describe('token-utils', () => {
    test('generateToken은 64자 hex 문자열을 반환한다', () => {
        const token = generateToken()
        expect(token).toHaveLength(64)
        expect(/^[0-9a-f]{64}$/.test(token)).toBe(true)
    })

    test('generateToken은 매번 다른 토큰을 생성한다', () => {
        const token1 = generateToken()
        const token2 = generateToken()
        expect(token1).not.toBe(token2)
    })

    test('hashToken은 SHA-256 해시를 반환한다', () => {
        const hash = hashToken('test-token')
        expect(hash).toHaveLength(64)
        expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true)
    })

    test('hashToken은 같은 입력에 같은 해시를 반환한다', () => {
        const hash1 = hashToken('same-input')
        const hash2 = hashToken('same-input')
        expect(hash1).toBe(hash2)
    })

    test('hashToken은 다른 입력에 다른 해시를 반환한다', () => {
        const hash1 = hashToken('input-a')
        const hash2 = hashToken('input-b')
        expect(hash1).not.toBe(hash2)
    })
})
