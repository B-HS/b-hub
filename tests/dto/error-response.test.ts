import { describe, expect, test } from 'bun:test'
import { errorResponseDto, errorResponses } from '../../dto/error-response'
import type { ErrorCode } from '../../lib/error-code'

describe('errorResponseDto', () => {
    test('유효한 에러 응답을 파싱한다', () => {
        const result = errorResponseDto.safeParse({
            success: false,
            error: {
                code: 'SOME_ERROR',
                message: 'Something went wrong',
            },
        })
        expect(result.success).toBe(true)
    })

    test('details가 포함된 에러를 파싱한다', () => {
        const result = errorResponseDto.safeParse({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid input',
                details: { field: 'name' },
            },
        })
        expect(result.success).toBe(true)
    })

    test('success가 true이면 실패한다', () => {
        const result = errorResponseDto.safeParse({
            success: true,
            error: { code: 'ERR', message: 'msg' },
        })
        expect(result.success).toBe(false)
    })

    test('error 필드가 없으면 실패한다', () => {
        expect(errorResponseDto.safeParse({ success: false }).success).toBe(false)
    })
})

describe('errorResponses', () => {
    test('같은 상태코드의 에러를 그룹핑한다', () => {
        const codes: ErrorCode[] = ['BLOG_POST_NOT_FOUND', 'BLOG_CATEGORY_NOT_FOUND']
        const result = errorResponses(codes)
        expect(result[404]).toBeDefined()
        expect(result[404].description).toContain('/')
    })

    test('다른 상태코드는 별도 키로 분리한다', () => {
        const codes: ErrorCode[] = ['BLOG_POST_NOT_FOUND', 'UNAUTHORIZED']
        const result = errorResponses(codes)
        expect(result[404]).toBeDefined()
        expect(result[401]).toBeDefined()
    })
})
