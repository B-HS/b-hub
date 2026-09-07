import { describe, expect, test } from 'bun:test'
import { createCredentialCrypto } from '../../lib/credential-crypto'

const TEST_KEY = 'a'.repeat(32)
const SPEEDUP_FACTOR = 2

describe('createCredentialCrypto 키 파생 캐시', () => {
    test('같은 암호문을 반복 복호화해도 같은 평문을 반환한다', () => {
        const crypto = createCredentialCrypto(TEST_KEY)
        const encrypted = crypto.encrypt('repeat-me')
        for (let i = 0; i < 20; i++) expect(crypto.decrypt(encrypted)).toBe('repeat-me')
    })

    test('같은 salt의 두 번째 복호화는 캐시된 키를 써서 첫 복호화보다 빠르다', () => {
        const encrypted = createCredentialCrypto(TEST_KEY).encrypt('timing-probe')
        const crypto = createCredentialCrypto(TEST_KEY)

        const coldStart = performance.now()
        expect(crypto.decrypt(encrypted)).toBe('timing-probe')
        const coldMs = performance.now() - coldStart

        const warmStart = performance.now()
        expect(crypto.decrypt(encrypted)).toBe('timing-probe')
        const warmMs = performance.now() - warmStart

        expect(warmMs * SPEEDUP_FACTOR).toBeLessThan(coldMs)
    })

    test('인스턴스마다 캐시가 분리되어 다른 키로는 복호화되지 않는다', () => {
        const crypto = createCredentialCrypto(TEST_KEY)
        const encrypted = crypto.encrypt('per-instance')
        expect(crypto.decrypt(encrypted)).toBe('per-instance')

        const other = createCredentialCrypto('b'.repeat(32))
        expect(() => other.decrypt(encrypted)).toThrow()
        expect(crypto.decrypt(encrypted)).toBe('per-instance')
    })

    test('여러 salt를 섞어 복호화해도 각각 올바른 평문을 반환한다', () => {
        const crypto = createCredentialCrypto(TEST_KEY)
        const encrypteds = Array.from({ length: 20 }, (_, i) => crypto.encrypt(`value-${i}`))
        const reversed = encrypteds.map((_, i) => encrypteds[encrypteds.length - 1 - i])
        reversed.forEach((encrypted, i) => expect(crypto.decrypt(encrypted)).toBe(`value-${encrypteds.length - 1 - i}`))
        encrypteds.forEach((encrypted, i) => expect(crypto.decrypt(encrypted)).toBe(`value-${i}`))
    })

    test('변조된 v2 암호문은 캐시된 키가 있어도 복호화에 실패한다', () => {
        const crypto = createCredentialCrypto(TEST_KEY)
        const encrypted = crypto.encrypt('tamper-me')
        expect(crypto.decrypt(encrypted)).toBe('tamper-me')
        const buf = Buffer.from(encrypted.slice(3), 'base64')
        buf[buf.length - 1] ^= 0xff
        expect(() => crypto.decrypt('v2:' + buf.toString('base64'))).toThrow()
    })
})
