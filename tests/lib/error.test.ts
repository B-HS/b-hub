import { describe, expect, test } from 'bun:test'
import { createAppError, isAppError, getStatusCode } from '../../lib/error'
import { ERROR_CODE } from '../../lib/error-code'
import { ERROR_MESSAGE } from '../../lib/error-message'

describe('createAppError', () => {
    test('에러 코드로 AppError를 생성한다', () => {
        const error = createAppError('NOT_FOUND')
        expect(error.code).toBe('NOT_FOUND')
        expect(error.message).toBe(ERROR_MESSAGE.NOT_FOUND)
        expect(error.statusCode).toBe(404)
        expect(error.details).toBeUndefined()
    })

    test('details를 포함한 에러를 생성한다', () => {
        const error = createAppError('VALIDATION_ERROR', { field: 'email' })
        expect(error.details).toEqual({ field: 'email' })
        expect(error.statusCode).toBe(400)
    })

    test('모든 에러 코드에 대해 정상적으로 생성된다', () => {
        for (const code of Object.values(ERROR_CODE)) {
            const error = createAppError(code)
            expect(error.code).toBe(code)
            expect(error.message).toBeTruthy()
            expect(error.statusCode).toBeGreaterThanOrEqual(400)
            expect(error.statusCode).toBeLessThanOrEqual(599)
        }
    })
})

describe('getStatusCode', () => {
    test('공통 에러 코드의 상태코드를 반환한다', () => {
        expect(getStatusCode('VALIDATION_ERROR')).toBe(400)
        expect(getStatusCode('UNAUTHORIZED')).toBe(401)
        expect(getStatusCode('FORBIDDEN')).toBe(403)
        expect(getStatusCode('NOT_FOUND')).toBe(404)
        expect(getStatusCode('RATE_LIMIT_EXCEEDED')).toBe(429)
        expect(getStatusCode('INTERNAL_ERROR')).toBe(500)
        expect(getStatusCode('EXTERNAL_API_ERROR')).toBe(502)
    })

    test('도메인 에러 코드의 상태코드를 반환한다', () => {
        expect(getStatusCode('BLOG_POST_NOT_FOUND')).toBe(404)
        expect(getStatusCode('BLOG_COMMENT_NOT_FOUND')).toBe(404)
        expect(getStatusCode('BLOG_IMAGE_TOO_LARGE')).toBe(413)
        expect(getStatusCode('WEATHER_INVALID_GRID')).toBe(400)
    })
})

describe('isAppError', () => {
    test('AppError 객체를 올바르게 판별한다', () => {
        const error = createAppError('NOT_FOUND')
        expect(isAppError(error)).toBe(true)
    })

    test('일반 Error 객체는 false를 반환한다', () => {
        expect(isAppError(new Error('test'))).toBe(false)
    })

    test('null, undefined, 문자열은 false를 반환한다', () => {
        expect(isAppError(null)).toBe(false)
        expect(isAppError(undefined)).toBe(false)
        expect(isAppError('error')).toBe(false)
    })

    test('구조만 맞으면 true를 반환한다', () => {
        expect(isAppError({ code: 'X', message: 'x', statusCode: 400 })).toBe(true)
    })

    test('부분적인 AppError 객체를 거부한다', () => {
        expect(isAppError({ code: 'X', message: 'x' })).toBe(false)
        expect(isAppError({ code: 'X', statusCode: 400 })).toBe(false)
        expect(isAppError({ message: 'x', statusCode: 400 })).toBe(false)
    })
})

describe('STATUS_MAP 커버리지', () => {
    test('모든 ERROR_CODE에 대해 getStatusCode가 유효한 HTTP 상태를 반환한다', () => {
        for (const code of Object.values(ERROR_CODE)) {
            const status = getStatusCode(code)
            expect(status).toBeGreaterThanOrEqual(400)
            expect(status).toBeLessThanOrEqual(599)
        }
    })
})
