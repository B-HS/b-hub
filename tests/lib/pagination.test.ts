import { describe, expect, test } from 'bun:test'
import { calcOffset, calcTotalPages, buildPagination, paginationQuerySchema } from '../../lib/pagination'

describe('calcOffset', () => {
    test('첫 페이지는 offset 0이다', () => {
        expect(calcOffset(1, 20)).toBe(0)
    })

    test('두 번째 페이지의 offset을 계산한다', () => {
        expect(calcOffset(2, 20)).toBe(20)
    })

    test('큰 페이지 번호를 처리한다', () => {
        expect(calcOffset(10, 50)).toBe(450)
    })
})

describe('calcTotalPages', () => {
    test('정확히 나누어지는 경우', () => {
        expect(calcTotalPages(100, 20)).toBe(5)
    })

    test('나머지가 있는 경우 올림한다', () => {
        expect(calcTotalPages(101, 20)).toBe(6)
    })

    test('total이 0이면 0이다', () => {
        expect(calcTotalPages(0, 20)).toBe(0)
    })

    test('total이 limit보다 작으면 1이다', () => {
        expect(calcTotalPages(5, 20)).toBe(1)
    })
})

describe('buildPagination', () => {
    test('페이지네이션 정보를 빌드한다', () => {
        const result = buildPagination(1, 20, 50)
        expect(result.page).toBe(1)
        expect(result.limit).toBe(20)
        expect(result.total).toBe(50)
        expect(result.totalPages).toBe(3)
        expect(result.hasNext).toBe(true)
        expect(result.hasPrev).toBe(false)
    })

    test('마지막 페이지에서 hasNext는 false이다', () => {
        const result = buildPagination(3, 20, 50)
        expect(result.hasNext).toBe(false)
        expect(result.hasPrev).toBe(true)
    })

    test('중간 페이지에서 hasNext, hasPrev 모두 true이다', () => {
        const result = buildPagination(2, 20, 50)
        expect(result.hasNext).toBe(true)
        expect(result.hasPrev).toBe(true)
    })

    test('단일 페이지일 때 hasNext, hasPrev 모두 false이다', () => {
        const result = buildPagination(1, 20, 5)
        expect(result.hasNext).toBe(false)
        expect(result.hasPrev).toBe(false)
    })
})

describe('paginationQuerySchema', () => {
    test('기본값을 적용한다', () => {
        const result = paginationQuerySchema.parse({})
        expect(result.page).toBe(1)
        expect(result.limit).toBe(20)
    })

    test('문자열을 숫자로 변환한다', () => {
        const result = paginationQuerySchema.parse({ page: '3', limit: '50' })
        expect(result.page).toBe(3)
        expect(result.limit).toBe(50)
    })

    test('page가 0 이하이면 실패한다', () => {
        expect(() => paginationQuerySchema.parse({ page: 0 })).toThrow()
        expect(() => paginationQuerySchema.parse({ page: -1 })).toThrow()
    })

    test('limit이 100을 초과하면 실패한다', () => {
        expect(() => paginationQuerySchema.parse({ limit: 101 })).toThrow()
    })

    test('limit이 0이면 실패한다', () => {
        expect(() => paginationQuerySchema.parse({ limit: 0 })).toThrow()
    })

    test('page가 소수점이면 int 검증에 실패한다', () => {
        expect(() => paginationQuerySchema.parse({ page: 1.5 })).toThrow()
        expect(() => paginationQuerySchema.parse({ page: 2.7 })).toThrow()
    })

    test('limit가 소수점이면 int 검증에 실패한다', () => {
        expect(() => paginationQuerySchema.parse({ limit: 10.5 })).toThrow()
    })
})
