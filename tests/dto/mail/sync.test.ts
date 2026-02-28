import { describe, expect, test } from 'bun:test'
import { mailSyncTriggerSchema, mailHistoricalSyncSchema, mailSyncStatusQuerySchema } from '../../../dto/mail/sync'

describe('mailSyncTriggerSchema', () => {
    test('유효한 데이터를 파싱한다', () => {
        const result = mailSyncTriggerSchema.parse({ accountId: 1 })
        expect(result.accountId).toBe(1)
    })

    test('folderId를 선택적으로 파싱한다', () => {
        const result = mailSyncTriggerSchema.parse({ accountId: 1, folderId: 2 })
        expect(result.folderId).toBe(2)
    })

    test('accountId는 양수여야 한다', () => {
        expect(() => mailSyncTriggerSchema.parse({ accountId: 0 })).toThrow()
        expect(() => mailSyncTriggerSchema.parse({ accountId: -1 })).toThrow()
    })
})

describe('mailHistoricalSyncSchema', () => {
    test('기본값을 적용한다', () => {
        const result = mailHistoricalSyncSchema.parse({ accountId: 1 })
        expect(result.batchSize).toBe(100)
    })

    test('batchSize 범위를 검증한다', () => {
        expect(() => mailHistoricalSyncSchema.parse({ accountId: 1, batchSize: 5 })).toThrow()
        expect(() => mailHistoricalSyncSchema.parse({ accountId: 1, batchSize: 501 })).toThrow()
    })

    test('유효한 batchSize를 허용한다', () => {
        const result = mailHistoricalSyncSchema.parse({ accountId: 1, batchSize: 200 })
        expect(result.batchSize).toBe(200)
    })

    test('cursor를 선택적으로 파싱한다', () => {
        const result = mailHistoricalSyncSchema.parse({
            accountId: 1,
            cursor: 'page-token-123',
        })
        expect(result.cursor).toBe('page-token-123')
    })

    test('cursor 최대 길이(500)를 초과하면 실패한다', () => {
        expect(() => mailHistoricalSyncSchema.parse({
            accountId: 1,
            cursor: 'a'.repeat(501),
        })).toThrow()
    })

    test('accountId 변환', () => {
        const result = mailHistoricalSyncSchema.parse({ accountId: 5 })
        expect(result.accountId).toBe(5)
    })
})

describe('mailSyncStatusQuerySchema', () => {
    test('accountId를 coerce한다', () => {
        const result = mailSyncStatusQuerySchema.parse({ accountId: '3' })
        expect(result.accountId).toBe(3)
    })

    test('양수가 아니면 실패한다', () => {
        expect(() => mailSyncStatusQuerySchema.parse({ accountId: '0' })).toThrow()
    })
})
