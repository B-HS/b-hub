import { describe, expect, test } from 'bun:test'
import { createMailCrypto } from '../../../../service/domain/mail/mail-crypto'

const TEST_KEY = 'a'.repeat(32)

describe('createMailCrypto', () => {
    test('암호화/복호화 라운드트립', () => {
        const crypto = createMailCrypto(TEST_KEY)
        const plaintext = 'Hello, World!'
        const encrypted = crypto.encrypt(plaintext)
        expect(crypto.decrypt(encrypted)).toBe(plaintext)
    })

    test('같은 평문이라도 다른 암호문을 생성한다 (IV 랜덤)', () => {
        const crypto = createMailCrypto(TEST_KEY)
        const plaintext = 'same text'
        const enc1 = crypto.encrypt(plaintext)
        const enc2 = crypto.encrypt(plaintext)
        expect(enc1).not.toBe(enc2)
        expect(crypto.decrypt(enc1)).toBe(plaintext)
        expect(crypto.decrypt(enc2)).toBe(plaintext)
    })

    test('빈 문자열을 암호화/복호화한다', () => {
        const crypto = createMailCrypto(TEST_KEY)
        const encrypted = crypto.encrypt('')
        expect(crypto.decrypt(encrypted)).toBe('')
    })

    test('한글을 암호화/복호화한다', () => {
        const crypto = createMailCrypto(TEST_KEY)
        const plaintext = '안녕하세요 테스트입니다'
        const encrypted = crypto.encrypt(plaintext)
        expect(crypto.decrypt(encrypted)).toBe(plaintext)
    })

    test('긴 문자열을 암호화/복호화한다', () => {
        const crypto = createMailCrypto(TEST_KEY)
        const plaintext = 'x'.repeat(10000)
        const encrypted = crypto.encrypt(plaintext)
        expect(crypto.decrypt(encrypted)).toBe(plaintext)
    })

    test('32자 미만 키는 패딩하여 동작한다', () => {
        const crypto = createMailCrypto('short')
        const plaintext = 'test'
        const encrypted = crypto.encrypt(plaintext)
        expect(crypto.decrypt(encrypted)).toBe(plaintext)
    })

    test('32자 초과 키는 잘라서 동작한다', () => {
        const crypto = createMailCrypto('b'.repeat(64))
        const plaintext = 'test'
        const encrypted = crypto.encrypt(plaintext)
        expect(crypto.decrypt(encrypted)).toBe(plaintext)
    })

    test('v2 암호문은 "v2:" 접두사를 가진다', () => {
        const crypto = createMailCrypto(TEST_KEY)
        const encrypted = crypto.encrypt('test')
        expect(encrypted.startsWith('v2:')).toBe(true)
    })

    test('같은 평문이라도 다른 암호문을 생성한다 (salt + IV 랜덤)', () => {
        const crypto = createMailCrypto(TEST_KEY)
        const enc1 = crypto.encrypt('same')
        const enc2 = crypto.encrypt('same')
        expect(enc1).not.toBe(enc2)
        expect(crypto.decrypt(enc1)).toBe('same')
        expect(crypto.decrypt(enc2)).toBe('same')
    })

    test('v1 레거시 암호문을 복호화할 수 있다 (하위호환)', () => {
        const { createCipheriv, randomBytes } = require('crypto')
        const v1Key = Buffer.from(TEST_KEY.padEnd(32, '0').slice(0, 32), 'utf-8')
        const iv = randomBytes(12)
        const cipher = createCipheriv('aes-256-gcm', v1Key, iv)
        const encrypted = Buffer.concat([cipher.update('legacy secret', 'utf-8'), cipher.final()])
        const authTag = cipher.getAuthTag()
        const v1Ciphertext = Buffer.concat([iv, authTag, encrypted]).toString('base64')

        expect(v1Ciphertext.startsWith('v2:')).toBe(false)

        const crypto = createMailCrypto(TEST_KEY)
        expect(crypto.decrypt(v1Ciphertext)).toBe('legacy secret')
    })

    test('변조된 v2 암호문은 에러를 발생시킨다', () => {
        const crypto = createMailCrypto(TEST_KEY)
        const encrypted = crypto.encrypt('secret')
        const payload = encrypted.slice(3)
        const buf = Buffer.from(payload, 'base64')
        buf[buf.length - 1] ^= 0xff
        const tampered = 'v2:' + buf.toString('base64')
        expect(() => crypto.decrypt(tampered)).toThrow()
    })

    test('잘못된 base64는 에러를 발생시킨다', () => {
        const crypto = createMailCrypto(TEST_KEY)
        expect(() => crypto.decrypt('not-valid-base64!!!')).toThrow()
    })

    test('다른 키로 복호화하면 에러를 발생시킨다', () => {
        const crypto1 = createMailCrypto('key1'.padEnd(32, '0'))
        const crypto2 = createMailCrypto('key2'.padEnd(32, '0'))
        const encrypted = crypto1.encrypt('secret')
        expect(() => crypto2.decrypt(encrypted)).toThrow()
    })

    test('짧은 키도 정상 동작한다', () => {
        const crypto = createMailCrypto('short')
        const encrypted = crypto.encrypt('test')
        expect(crypto.decrypt(encrypted)).toBe('test')
    })

    test('JSON 데이터를 암호화/복호화한다', () => {
        const crypto = createMailCrypto(TEST_KEY)
        const data = JSON.stringify({ password: 'secret123', token: 'abc' })
        const encrypted = crypto.encrypt(data)
        expect(JSON.parse(crypto.decrypt(encrypted))).toEqual({ password: 'secret123', token: 'abc' })
    })
})
