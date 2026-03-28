import { describe, expect, test } from 'bun:test'
import { idParamSchema, stringIdParamSchema, paginationQuerySchema, searchQuerySchema, timestampSchema } from '../../dto/common'

describe('idParamSchema', () => {
    test('양의 정수를 파싱한다', () => {
        const result = idParamSchema.safeParse({ id: 1 })
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.id).toBe(1)
    })

    test('문자열 숫자를 coerce한다', () => {
        const result = idParamSchema.safeParse({ id: '42' })
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.id).toBe(42)
    })

    test('0은 실패한다', () => {
        expect(idParamSchema.safeParse({ id: 0 }).success).toBe(false)
    })

    test('음수는 실패한다', () => {
        expect(idParamSchema.safeParse({ id: -1 }).success).toBe(false)
    })

    test('소수점은 실패한다', () => {
        expect(idParamSchema.safeParse({ id: 1.5 }).success).toBe(false)
    })
})

describe('stringIdParamSchema', () => {
    test('문자열 ID를 파싱한다', () => {
        const result = stringIdParamSchema.safeParse({ id: 'abc-123' })
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.id).toBe('abc-123')
    })

    test('빈 문자열은 실패한다', () => {
        expect(stringIdParamSchema.safeParse({ id: '' }).success).toBe(false)
    })
})

describe('paginationQuerySchema', () => {
    test('기본값 page=1, limit=20을 적용한다', () => {
        const result = paginationQuerySchema.safeParse({})
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.page).toBe(1)
            expect(result.data.limit).toBe(20)
        }
    })

    test('커스텀 값을 파싱한다', () => {
        const result = paginationQuerySchema.safeParse({ page: '3', limit: '50' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.page).toBe(3)
            expect(result.data.limit).toBe(50)
        }
    })

    test('limit 최댓값 100을 초과하면 실패한다', () => {
        expect(paginationQuerySchema.safeParse({ limit: 101 }).success).toBe(false)
    })

    test('limit 최솟값 1 미만이면 실패한다', () => {
        expect(paginationQuerySchema.safeParse({ limit: 0 }).success).toBe(false)
    })

    test('page 0은 실패한다', () => {
        expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false)
    })
})

describe('searchQuerySchema', () => {
    test('q가 없어도 파싱된다', () => {
        const result = searchQuerySchema.safeParse({})
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.q).toBeUndefined()
    })

    test('q가 있으면 포함한다', () => {
        const result = searchQuerySchema.safeParse({ q: 'search term' })
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.q).toBe('search term')
    })

    test('기본값 page=1, limit=20을 적용한다', () => {
        const result = searchQuerySchema.safeParse({})
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.page).toBe(1)
            expect(result.data.limit).toBe(20)
        }
    })

    test('빈 q 문자열은 실패한다', () => {
        expect(searchQuerySchema.safeParse({ q: '' }).success).toBe(false)
    })
})

describe('timestampSchema', () => {
    test('유효한 datetime 문자열을 파싱한다', () => {
        const result = timestampSchema.safeParse({
            createdAt: '2024-01-15T10:00:00Z',
            updatedAt: '2024-01-15T11:00:00Z',
        })
        expect(result.success).toBe(true)
    })

    test('잘못된 datetime은 실패한다', () => {
        expect(
            timestampSchema.safeParse({
                createdAt: 'not-a-date',
                updatedAt: '2024-01-15T10:00:00Z',
            }).success,
        ).toBe(false)
    })
})
