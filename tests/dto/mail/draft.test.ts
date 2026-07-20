import { describe, expect, test } from 'bun:test'
import { mailDraftCreateSchema, mailDraftUpdateSchema, mailDraftParamSchema } from '../../../dto/mail/draft'

describe('mailDraftCreateSchema', () => {
    test('accountId만으로도 파싱하고 기본값을 적용한다', () => {
        const result = mailDraftCreateSchema.parse({ accountId: 1 })
        expect(result.accountId).toBe(1)
        expect(result.to).toEqual([])
        expect(result.cc).toEqual([])
        expect(result.bcc).toEqual([])
        expect(result.subject).toBe('')
    })

    test('전체 필드를 파싱한다', () => {
        const result = mailDraftCreateSchema.parse({
            accountId: 2,
            to: [{ name: 'To', address: 'to@test.com' }],
            cc: [{ name: 'Cc', address: 'cc@test.com' }],
            bcc: [{ name: 'Bcc', address: 'bcc@test.com' }],
            subject: 'Hello',
            bodyHtml: '<p>Hi</p>',
            bodyText: 'Hi',
            inReplyTo: '<msg-1@test.com>',
            references: '<msg-0@test.com> <msg-1@test.com>',
            replyToMessageId: 5,
        })
        expect(result.to).toHaveLength(1)
        expect(result.subject).toBe('Hello')
        expect(result.replyToMessageId).toBe(5)
    })

    test('accountId가 없으면 실패한다', () => {
        expect(() => mailDraftCreateSchema.parse({ subject: 'Hi' })).toThrow()
    })

    test('accountId가 양수가 아니면 실패한다', () => {
        expect(() => mailDraftCreateSchema.parse({ accountId: 0 })).toThrow()
        expect(() => mailDraftCreateSchema.parse({ accountId: -1 })).toThrow()
    })

    test('to에 잘못된 이메일이 있으면 실패한다', () => {
        expect(() => mailDraftCreateSchema.parse({ accountId: 1, to: [{ name: 'X', address: 'not-email' }] })).toThrow()
    })

    test('subject에 CRLF가 포함되면 실패한다', () => {
        expect(() => mailDraftCreateSchema.parse({ accountId: 1, subject: 'Hello\r\nBcc: evil@test.com' })).toThrow()
    })

    test('subject 최대 길이를 검증한다', () => {
        expect(() => mailDraftCreateSchema.parse({ accountId: 1, subject: 'a'.repeat(1001) })).toThrow()
    })

    test('inReplyTo에 CRLF가 포함되면 실패한다', () => {
        expect(() => mailDraftCreateSchema.parse({ accountId: 1, inReplyTo: '<a>\r\n<b>' })).toThrow()
    })

    test('replyToMessageId가 양수가 아니면 실패한다', () => {
        expect(() => mailDraftCreateSchema.parse({ accountId: 1, replyToMessageId: 0 })).toThrow()
    })
})

describe('mailDraftUpdateSchema', () => {
    test('빈 객체를 허용한다', () => {
        const result = mailDraftUpdateSchema.parse({})
        expect(result.subject).toBeUndefined()
        expect(result.to).toBeUndefined()
    })

    test('일부 필드만 업데이트한다', () => {
        const result = mailDraftUpdateSchema.parse({ subject: 'Updated', bodyHtml: '<p>New</p>' })
        expect(result.subject).toBe('Updated')
        expect(result.bodyHtml).toBe('<p>New</p>')
    })

    test('to 배열을 파싱한다', () => {
        const result = mailDraftUpdateSchema.parse({ to: [{ name: 'To', address: 'to@test.com' }] })
        expect(result.to).toHaveLength(1)
    })

    test('subject에 CRLF가 포함되면 실패한다', () => {
        expect(() => mailDraftUpdateSchema.parse({ subject: 'Hello\nEvil' })).toThrow()
    })
})

describe('mailDraftParamSchema', () => {
    test('유효한 id를 파싱한다', () => {
        expect(mailDraftParamSchema.parse({ id: '42' }).id).toBe(42)
    })

    test('0은 실패한다', () => {
        expect(() => mailDraftParamSchema.parse({ id: '0' })).toThrow()
    })

    test('음수는 실패한다', () => {
        expect(() => mailDraftParamSchema.parse({ id: '-1' })).toThrow()
    })

    test('문자열은 실패한다', () => {
        expect(() => mailDraftParamSchema.parse({ id: 'abc' })).toThrow()
    })
})
