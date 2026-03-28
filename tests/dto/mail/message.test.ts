import { describe, expect, test } from 'bun:test'
import {
    mailMessageListQuerySchema,
    mailMessageSearchQuerySchema,
    mailMessageIdsSchema,
    mailComposeSchema,
    mailReplySchema,
    mailForwardSchema,
    mailMessageParamSchema,
} from '../../../dto/mail/message'

describe('mailMessageListQuerySchema', () => {
    test('기본값을 적용한다', () => {
        const result = mailMessageListQuerySchema.parse({})
        expect(result.page).toBe(1)
        expect(result.limit).toBe(20)
    })

    test('커스텀 값을 파싱한다', () => {
        const result = mailMessageListQuerySchema.parse({
            accountId: '1',
            folderId: '2',
            page: '3',
            limit: '50',
        })
        expect(result.accountId).toBe(1)
        expect(result.folderId).toBe(2)
        expect(result.page).toBe(3)
        expect(result.limit).toBe(50)
    })

    test('isRead/isStarred boolean 변환', () => {
        const result = mailMessageListQuerySchema.parse({
            isRead: 'true',
            isStarred: 'false',
        })
        expect(result.isRead).toBe(true)
        expect(result.isStarred).toBe(false)
    })

    test('limit 최대값을 제한한다', () => {
        expect(() => mailMessageListQuerySchema.parse({ limit: '101' })).toThrow()
    })

    test('page는 양수여야 한다', () => {
        expect(() => mailMessageListQuerySchema.parse({ page: '0' })).toThrow()
    })
})

describe('mailMessageSearchQuerySchema', () => {
    test('필수 q 필드를 검증한다', () => {
        expect(() => mailMessageSearchQuerySchema.parse({})).toThrow()
    })

    test('빈 q는 실패한다', () => {
        expect(() => mailMessageSearchQuerySchema.parse({ q: '' })).toThrow()
    })

    test('기본값을 적용한다', () => {
        const result = mailMessageSearchQuerySchema.parse({ q: 'hello' })
        expect(result.page).toBe(1)
        expect(result.limit).toBe(20)
    })

    test('q 최대 길이(500)를 초과하면 실패한다', () => {
        expect(() => mailMessageSearchQuerySchema.parse({ q: 'a'.repeat(501) })).toThrow()
    })

    test('q 최대 길이(500) 이내는 성공한다', () => {
        const result = mailMessageSearchQuerySchema.parse({ q: 'a'.repeat(500) })
        expect(result.q).toHaveLength(500)
    })
})

describe('mailMessageIdsSchema', () => {
    test('유효한 messageIds를 파싱한다', () => {
        const result = mailMessageIdsSchema.parse({ messageIds: [1, 2, 3] })
        expect(result.messageIds).toEqual([1, 2, 3])
    })

    test('빈 배열은 실패한다', () => {
        expect(() => mailMessageIdsSchema.parse({ messageIds: [] })).toThrow()
    })

    test('100개 초과는 실패한다', () => {
        const ids = Array.from({ length: 101 }, (_, i) => i + 1)
        expect(() => mailMessageIdsSchema.parse({ messageIds: ids })).toThrow()
    })

    test('양수가 아닌 ID는 실패한다', () => {
        expect(() => mailMessageIdsSchema.parse({ messageIds: [0] })).toThrow()
        expect(() => mailMessageIdsSchema.parse({ messageIds: [-1] })).toThrow()
    })
})

describe('mailComposeSchema', () => {
    test('유효한 데이터를 파싱한다', () => {
        const result = mailComposeSchema.parse({
            accountId: 1,
            to: [{ name: 'Test', address: 'test@test.com' }],
            subject: 'Hello',
            bodyHtml: '<p>Hi</p>',
        })
        expect(result.to).toHaveLength(1)
        expect(result.subject).toBe('Hello')
    })

    test('to가 비어있으면 실패한다', () => {
        expect(() =>
            mailComposeSchema.parse({
                accountId: 1,
                to: [],
                subject: 'Hello',
            }),
        ).toThrow()
    })

    test('subject 최대 길이를 검증한다', () => {
        expect(() =>
            mailComposeSchema.parse({
                accountId: 1,
                to: [{ name: 'Test', address: 'test@test.com' }],
                subject: 'a'.repeat(1001),
            }),
        ).toThrow()
    })

    test('subject에 CRLF가 포함되면 실패한다', () => {
        expect(() =>
            mailComposeSchema.parse({
                accountId: 1,
                to: [{ name: 'Test', address: 'test@test.com' }],
                subject: 'Hello\r\nBcc: evil@test.com',
            }),
        ).toThrow()
    })

    test('subject에 \\n이 포함되면 실패한다', () => {
        expect(() =>
            mailComposeSchema.parse({
                accountId: 1,
                to: [{ name: 'Test', address: 'test@test.com' }],
                subject: 'Hello\nEvil',
            }),
        ).toThrow()
    })

    test('subject에 \\r이 포함되면 실패한다', () => {
        expect(() =>
            mailComposeSchema.parse({
                accountId: 1,
                to: [{ name: 'Test', address: 'test@test.com' }],
                subject: 'Hello\rEvil',
            }),
        ).toThrow()
    })
})

describe('mailReplySchema', () => {
    test('bodyHtml만으로 파싱한다', () => {
        const result = mailReplySchema.parse({ bodyHtml: '<p>Reply</p>' })
        expect(result.bodyHtml).toBe('<p>Reply</p>')
    })

    test('빈 객체를 허용한다', () => {
        const result = mailReplySchema.parse({})
        expect(result.bodyHtml).toBeUndefined()
    })
})

describe('mailMessageParamSchema', () => {
    test('유효한 messageId를 파싱한다', () => {
        const result = mailMessageParamSchema.parse({ messageId: '42' })
        expect(result.messageId).toBe(42)
    })

    test('문자열은 실패한다', () => {
        expect(() => mailMessageParamSchema.parse({ messageId: 'abc' })).toThrow()
    })

    test('0은 실패한다', () => {
        expect(() => mailMessageParamSchema.parse({ messageId: '0' })).toThrow()
    })

    test('음수는 실패한다', () => {
        expect(() => mailMessageParamSchema.parse({ messageId: '-1' })).toThrow()
    })

    test('소수점은 실패한다', () => {
        expect(() => mailMessageParamSchema.parse({ messageId: '1.5' })).toThrow()
    })
})

describe('mailForwardSchema', () => {
    test('유효한 데이터를 파싱한다', () => {
        const result = mailForwardSchema.parse({
            to: [{ name: 'Fwd', address: 'fwd@test.com' }],
        })
        expect(result.to).toHaveLength(1)
    })

    test('to가 비어있으면 실패한다', () => {
        expect(() => mailForwardSchema.parse({ to: [] })).toThrow()
    })
})
