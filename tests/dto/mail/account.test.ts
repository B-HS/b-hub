import { describe, expect, test } from 'bun:test'
import { mailAccountCreateSchema, mailAccountUpdateSchema, mailAccountParamSchema } from '../../../dto/mail/account'

describe('mailAccountCreateSchema', () => {
    test('유효한 gmail 데이터를 파싱한다', () => {
        const result = mailAccountCreateSchema.parse({
            provider: 'gmail',
            email: 'test@gmail.com',
            betterAuthAccountId: 'ba-1',
        })
        expect(result.provider).toBe('gmail')
        expect(result.email).toBe('test@gmail.com')
    })

    test('유효한 IMAP 데이터를 파싱한다', () => {
        const result = mailAccountCreateSchema.parse({
            provider: 'imap',
            email: 'test@custom.com',
            credentials: { password: 'secret' },
            imapHost: 'imap.custom.com',
            imapPort: 993,
            imapTls: true,
            smtpHost: 'smtp.custom.com',
            smtpPort: 587,
            smtpTls: true,
        })
        expect(result.provider).toBe('imap')
        expect(result.credentials?.password).toBe('secret')
    })

    test('provider enum을 검증한다', () => {
        expect(() => mailAccountCreateSchema.parse({
            provider: 'yahoo',
            email: 'test@yahoo.com',
        })).toThrow()
    })

    test('naver, daum 프로바이더를 허용한다', () => {
        const naver = mailAccountCreateSchema.parse({ provider: 'naver', email: 'test@naver.com' })
        expect(naver.provider).toBe('naver')

        const daum = mailAccountCreateSchema.parse({ provider: 'daum', email: 'test@daum.net' })
        expect(daum.provider).toBe('daum')
    })

    test('email 형식을 검증한다', () => {
        expect(() => mailAccountCreateSchema.parse({
            provider: 'gmail',
            email: 'not-an-email',
        })).toThrow()
    })

    test('credentials에 username을 포함할 수 있다', () => {
        const result = mailAccountCreateSchema.parse({
            provider: 'naver',
            email: 'bbb301@naver.com',
            credentials: { username: 'bbb301', password: 'secret' },
        })
        expect(result.credentials?.username).toBe('bbb301')
        expect(result.credentials?.password).toBe('secret')
    })

    test('credentials에 username 없이도 유효하다', () => {
        const result = mailAccountCreateSchema.parse({
            provider: 'imap',
            email: 'test@custom.com',
            credentials: { password: 'secret' },
        })
        expect(result.credentials?.username).toBeUndefined()
        expect(result.credentials?.password).toBe('secret')
    })

    test('포트 범위를 검증한다', () => {
        expect(() => mailAccountCreateSchema.parse({
            provider: 'imap',
            email: 'test@test.com',
            imapPort: 0,
        })).toThrow()

        expect(() => mailAccountCreateSchema.parse({
            provider: 'imap',
            email: 'test@test.com',
            imapPort: 70000,
        })).toThrow()
    })

    test('displayName 최대 길이를 검증한다', () => {
        expect(() => mailAccountCreateSchema.parse({
            provider: 'gmail',
            email: 'test@gmail.com',
            displayName: 'a'.repeat(101),
        })).toThrow()
    })

    test('내부 IP imapHost를 차단한다', () => {
        expect(() => mailAccountCreateSchema.parse({
            provider: 'imap',
            email: 'test@test.com',
            imapHost: '127.0.0.1',
        })).toThrow()
    })

    test('내부 IP smtpHost를 차단한다', () => {
        expect(() => mailAccountCreateSchema.parse({
            provider: 'imap',
            email: 'test@test.com',
            smtpHost: '169.254.169.254',
        })).toThrow()
    })

    test('localhost를 차단한다', () => {
        expect(() => mailAccountCreateSchema.parse({
            provider: 'imap',
            email: 'test@test.com',
            imapHost: 'localhost',
        })).toThrow()
    })

    test('private 네트워크 대역을 차단한다', () => {
        const blockedHosts = ['10.0.0.1', '172.16.0.1', '192.168.1.1', '0.0.0.0']
        for (const host of blockedHosts) {
            expect(() => mailAccountCreateSchema.parse({
                provider: 'imap',
                email: 'test@test.com',
                imapHost: host,
            })).toThrow()
        }
    })

    test('공개 호스트는 허용한다', () => {
        const result = mailAccountCreateSchema.parse({
            provider: 'imap',
            email: 'test@test.com',
            imapHost: 'imap.gmail.com',
            smtpHost: 'smtp.gmail.com',
        })
        expect(result.imapHost).toBe('imap.gmail.com')
        expect(result.smtpHost).toBe('smtp.gmail.com')
    })
})

describe('mailAccountParamSchema', () => {
    test('유효한 accountId를 파싱한다', () => {
        const result = mailAccountParamSchema.parse({ accountId: '1' })
        expect(result.accountId).toBe(1)
    })

    test('문자열은 실패한다', () => {
        expect(() => mailAccountParamSchema.parse({ accountId: 'abc' })).toThrow()
    })

    test('0은 실패한다', () => {
        expect(() => mailAccountParamSchema.parse({ accountId: '0' })).toThrow()
    })

    test('음수는 실패한다', () => {
        expect(() => mailAccountParamSchema.parse({ accountId: '-5' })).toThrow()
    })

    test('소수점은 실패한다', () => {
        expect(() => mailAccountParamSchema.parse({ accountId: '1.5' })).toThrow()
    })
})

describe('mailAccountUpdateSchema', () => {
    test('displayName만 업데이트한다', () => {
        const result = mailAccountUpdateSchema.parse({ displayName: 'New Name' })
        expect(result.displayName).toBe('New Name')
    })

    test('isActive만 업데이트한다', () => {
        const result = mailAccountUpdateSchema.parse({ isActive: false })
        expect(result.isActive).toBe(false)
    })

    test('빈 객체를 허용한다', () => {
        const result = mailAccountUpdateSchema.parse({})
        expect(result.displayName).toBeUndefined()
        expect(result.isActive).toBeUndefined()
    })
})
