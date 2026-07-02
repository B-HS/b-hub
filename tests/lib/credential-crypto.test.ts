import { describe, expect, test } from 'bun:test'
import { createCredentialCrypto } from '../../lib/credential-crypto'

const TEST_KEY = 'a'.repeat(32)

describe('createCredentialCrypto', () => {
    test('encrypt한 값을 decrypt로 복원한다', () => {
        const crypto = createCredentialCrypto(TEST_KEY)
        const plaintext = 'super-secret-token'
        expect(crypto.decrypt(crypto.encrypt(plaintext))).toBe(plaintext)
    })

    test('암호문은 v2: 접두사를 가진다', () => {
        const crypto = createCredentialCrypto(TEST_KEY)
        expect(crypto.encrypt('value').startsWith('v2:')).toBe(true)
    })

    test('같은 평문이라도 매번 다른 암호문을 생성한다 (salt/iv 랜덤)', () => {
        const crypto = createCredentialCrypto(TEST_KEY)
        const enc1 = crypto.encrypt('same-plaintext')
        const enc2 = crypto.encrypt('same-plaintext')
        expect(enc1).not.toBe(enc2)
        expect(crypto.decrypt(enc1)).toBe('same-plaintext')
        expect(crypto.decrypt(enc2)).toBe('same-plaintext')
    })

    test('다른 키로 복호화하면 실패한다', () => {
        const crypto1 = createCredentialCrypto('k1'.repeat(16))
        const crypto2 = createCredentialCrypto('k2'.repeat(16))
        const encrypted = crypto1.encrypt('secret')
        expect(() => crypto2.decrypt(encrypted)).toThrow()
    })

    test('JSON 자격증명을 왕복 처리한다', () => {
        const crypto = createCredentialCrypto(TEST_KEY)
        const credentials = { apiKey: 'sk-123', refreshToken: 'rt-456' }
        const restored = JSON.parse(crypto.decrypt(crypto.encrypt(JSON.stringify(credentials))))
        expect(restored).toEqual(credentials)
    })

    test('빈 문자열과 한글을 왕복 처리한다', () => {
        const crypto = createCredentialCrypto(TEST_KEY)
        expect(crypto.decrypt(crypto.encrypt(''))).toBe('')
        expect(crypto.decrypt(crypto.encrypt('한글 자격증명'))).toBe('한글 자격증명')
    })

    test('변조된 암호문은 복호화에 실패한다', () => {
        const crypto = createCredentialCrypto(TEST_KEY)
        const encrypted = crypto.encrypt('secret')
        const buf = Buffer.from(encrypted.slice(3), 'base64')
        buf[buf.length - 1] ^= 0xff
        expect(() => crypto.decrypt('v2:' + buf.toString('base64'))).toThrow()
    })
})
