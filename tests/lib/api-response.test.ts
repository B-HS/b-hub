import { describe, expect, test } from 'bun:test'
import { successResponse, paginatedResponse, errorResponse } from '../../lib/api-response'

describe('successResponse', () => {
    test('성공 응답 객체를 생성한다', () => {
        const result = successResponse({ id: 1, name: 'test' })
        expect(result.success).toBe(true)
        expect(result.data).toEqual({ id: 1, name: 'test' })
    })

    test('빈 데이터도 처리한다', () => {
        const result = successResponse(null)
        expect(result.success).toBe(true)
        expect(result.data).toBeNull()
    })

    test('배열 데이터를 처리한다', () => {
        const result = successResponse([1, 2, 3])
        expect(result.data).toEqual([1, 2, 3])
    })
})

describe('paginatedResponse', () => {
    test('페이지네이션 응답을 생성한다', () => {
        const result = paginatedResponse([{ id: 1 }], {
            page: 1,
            limit: 20,
            total: 50,
        })
        expect(result.success).toBe(true)
        expect(result.data).toEqual([{ id: 1 }])
        expect(result.pagination.page).toBe(1)
        expect(result.pagination.limit).toBe(20)
        expect(result.pagination.total).toBe(50)
        expect(result.pagination.totalPages).toBe(3)
    })

    test('totalPages를 올바르게 계산한다', () => {
        const result = paginatedResponse([], { page: 1, limit: 10, total: 25 })
        expect(result.pagination.totalPages).toBe(3)
    })

    test('total이 0이면 totalPages도 0이다', () => {
        const result = paginatedResponse([], { page: 1, limit: 20, total: 0 })
        expect(result.pagination.totalPages).toBe(0)
    })

    test('total이 limit과 같으면 totalPages는 1이다', () => {
        const result = paginatedResponse([], { page: 1, limit: 20, total: 20 })
        expect(result.pagination.totalPages).toBe(1)
    })
})

describe('errorResponse', () => {
    test('에러 응답을 생성한다', () => {
        const result = errorResponse('NOT_FOUND', '리소스를 찾을 수 없습니다')
        expect(result.success).toBe(false)
        expect(result.error.code).toBe('NOT_FOUND')
        expect(result.error.message).toBe('리소스를 찾을 수 없습니다')
        expect(result.error.details).toBeUndefined()
    })

    test('details를 포함한 에러 응답을 생성한다', () => {
        const result = errorResponse('VALIDATION_ERROR', '검증 실패', {
            field: 'email',
        })
        expect(result.error.details).toEqual({ field: 'email' })
    })

    test('details가 없으면 error 객체에 details 키가 없다', () => {
        const result = errorResponse('NOT_FOUND', 'test')
        expect('details' in result.error).toBe(false)
    })

    test('production 환경에서는 details를 포함하지 않는다', () => {
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'production'
        const result = errorResponse('ERROR', 'msg', { field: 'email' })
        expect('details' in result.error).toBe(false)
        process.env.NODE_ENV = originalEnv
    })

    test('details가 빈 객체이면 포함한다', () => {
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'test'
        const result = errorResponse('ERROR', 'msg', {})
        expect('details' in result.error).toBe(true)
        expect(result.error.details).toEqual({})
        process.env.NODE_ENV = originalEnv
    })

    test('details가 undefined이면 포함하지 않는다', () => {
        const result = errorResponse('ERROR', 'msg', undefined)
        expect('details' in result.error).toBe(false)
    })
})

describe('paginatedResponse 엣지 케이스', () => {
    test('total=0이면 빈 data와 페이지 정보를 반환한다', () => {
        const result = paginatedResponse([], { page: 1, limit: 20, total: 0 })
        expect(result.success).toBe(true)
        expect(result.data).toEqual([])
        expect(result.pagination.total).toBe(0)
        expect(result.pagination.totalPages).toBe(0)
        expect(result.pagination.page).toBe(1)
        expect(result.pagination.limit).toBe(20)
    })
})
