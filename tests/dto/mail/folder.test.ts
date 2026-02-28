import { describe, expect, test } from 'bun:test'
import { mailFolderListQuerySchema, mailFolderResponseSchema } from '../../../dto/mail/folder'

describe('mailFolderListQuerySchema', () => {
    test('유효한 accountId를 파싱한다', () => {
        const result = mailFolderListQuerySchema.parse({ accountId: 1 })
        expect(result.accountId).toBe(1)
    })

    test('문자열 accountId를 숫자로 변환한다', () => {
        const result = mailFolderListQuerySchema.parse({ accountId: '5' })
        expect(result.accountId).toBe(5)
    })

    test('0 이하 값을 거부한다', () => {
        expect(() => mailFolderListQuerySchema.parse({ accountId: 0 })).toThrow()
        expect(() => mailFolderListQuerySchema.parse({ accountId: -1 })).toThrow()
    })

    test('소수점 값을 거부한다', () => {
        expect(() => mailFolderListQuerySchema.parse({ accountId: 1.5 })).toThrow()
    })
})

describe('mailFolderResponseSchema', () => {
    test('유효한 폴더 데이터를 파싱한다', () => {
        const result = mailFolderResponseSchema.parse({
            id: 1,
            accountId: 1,
            name: 'INBOX',
            type: 'inbox',
            parentId: null,
            messageCount: 42,
            unreadCount: 3,
        })
        expect(result.name).toBe('INBOX')
        expect(result.messageCount).toBe(42)
    })

    test('parentId null을 허용한다', () => {
        const result = mailFolderResponseSchema.parse({
            id: 1,
            accountId: 1,
            name: 'INBOX',
            type: 'inbox',
            parentId: null,
            messageCount: 0,
            unreadCount: 0,
        })
        expect(result.parentId).toBeNull()
    })

    test('parentId 숫자를 허용한다', () => {
        const result = mailFolderResponseSchema.parse({
            id: 2,
            accountId: 1,
            name: 'Sub',
            type: 'custom',
            parentId: 1,
            messageCount: 0,
            unreadCount: 0,
        })
        expect(result.parentId).toBe(1)
    })
})
