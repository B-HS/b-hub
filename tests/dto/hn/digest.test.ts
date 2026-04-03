import { describe, expect, test } from 'bun:test'
import {
    digestListQuerySchema,
    digestDetailParamSchema,
    digestResponseSchema,
    cronSyncResponseSchema,
    cronDailyResponseSchema,
} from '../../../dto/hn/digest'

describe('digestListQuerySchema', () => {
    test('유효한 type과 limit를 파싱한다', () => {
        const result = digestListQuerySchema.safeParse({ type: 'daily', limit: '10' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.type).toBe('daily')
            expect(result.data.limit).toBe(10)
        }
    })

    test('type이 daily/weekly/monthly 외 값이면 실패한다', () => {
        expect(digestListQuerySchema.safeParse({ type: 'yearly' }).success).toBe(false)
    })

    test('limit 기본값 30을 적용한다', () => {
        const result = digestListQuerySchema.safeParse({ type: 'weekly' })
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.limit).toBe(30)
    })

    test('limit가 50을 초과하면 실패한다', () => {
        expect(digestListQuerySchema.safeParse({ type: 'daily', limit: 51 }).success).toBe(false)
    })

    test('limit가 0이면 실패한다', () => {
        expect(digestListQuerySchema.safeParse({ type: 'daily', limit: 0 }).success).toBe(false)
    })
})

describe('digestDetailParamSchema', () => {
    test('유효한 type과 key를 파싱한다', () => {
        const result = digestDetailParamSchema.safeParse({ type: 'daily', key: '2024-01-15' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.type).toBe('daily')
            expect(result.data.key).toBe('2024-01-15')
        }
    })

    test('key가 빈 문자열이면 실패한다', () => {
        expect(digestDetailParamSchema.safeParse({ type: 'daily', key: '' }).success).toBe(false)
    })

    test('monthly type을 파싱한다', () => {
        const result = digestDetailParamSchema.safeParse({ type: 'monthly', key: '2024-01' })
        expect(result.success).toBe(true)
    })
})

describe('digestResponseSchema', () => {
    test('유효한 다이제스트 응답을 파싱한다', () => {
        const result = digestResponseSchema.safeParse({
            id: 1,
            digestType: 'daily',
            digestKey: '2024-01-15',
            title: 'Daily Digest',
            content: 'Content here',
            storyIds: [1, 2, 3],
            createdAt: '2024-01-15T00:00:00Z',
        })
        expect(result.success).toBe(true)
    })

    test('storyIds가 null이어도 파싱된다', () => {
        const result = digestResponseSchema.safeParse({
            id: 1,
            digestType: 'daily',
            digestKey: '2024-01-15',
            title: 'Daily',
            content: 'Content',
            storyIds: null,
            createdAt: null,
        })
        expect(result.success).toBe(true)
    })
})

describe('cronSyncResponseSchema', () => {
    test('유효한 sync 응답을 파싱한다', () => {
        const result = cronSyncResponseSchema.safeParse({
            success: true,
            synced: {
                top: { synced: 10, updated: 5, parsed: 3 },
                best: { synced: 8, updated: 2, parsed: 1 },
                new: { synced: 15, updated: 7, parsed: 4 },
            },
        })
        expect(result.success).toBe(true)
    })
})

describe('cronDailyResponseSchema', () => {
    test('유효한 daily 응답을 파싱한다', () => {
        const result = cronDailyResponseSchema.safeParse({
            success: true,
            summarized: 5,
            date: '2024-01-15',
        })
        expect(result.success).toBe(true)
    })
})
