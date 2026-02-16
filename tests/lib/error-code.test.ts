import { describe, expect, test } from 'bun:test'
import { ERROR_CODE, type ErrorCode } from '../../lib/error-code'
import { ERROR_MESSAGE } from '../../lib/error-message'

describe('ERROR_CODE', () => {
    test('모든 에러 코드는 문자열 값을 가진다', () => {
        for (const [key, value] of Object.entries(ERROR_CODE)) {
            expect(typeof value).toBe('string')
            expect(key).toBe(value)
        }
    })

    test('에러 코드가 최소 30개 이상 정의되어 있다', () => {
        expect(Object.keys(ERROR_CODE).length).toBeGreaterThanOrEqual(30)
    })

    test('도메인별 접두사가 올바르게 사용된다', () => {
        const blogCodes = Object.keys(ERROR_CODE).filter((k) => k.startsWith('BLOG_'))
        const weatherCodes = Object.keys(ERROR_CODE).filter((k) => k.startsWith('WEATHER_'))
        const hnCodes = Object.keys(ERROR_CODE).filter((k) => k.startsWith('HN_'))
        const badgeCodes = Object.keys(ERROR_CODE).filter((k) => k.startsWith('BADGE_'))

        expect(blogCodes.length).toBeGreaterThanOrEqual(4)
        expect(weatherCodes.length).toBeGreaterThanOrEqual(3)
        expect(hnCodes.length).toBeGreaterThanOrEqual(4)
        expect(badgeCodes.length).toBeGreaterThanOrEqual(2)
    })
})

describe('ERROR_CODE <-> ERROR_MESSAGE 매핑 완전성', () => {
    test('모든 에러 코드에 대응하는 메시지가 존재한다', () => {
        for (const code of Object.values(ERROR_CODE)) {
            expect(ERROR_MESSAGE[code as ErrorCode]).toBeDefined()
            expect(typeof ERROR_MESSAGE[code as ErrorCode]).toBe('string')
            expect(ERROR_MESSAGE[code as ErrorCode].length).toBeGreaterThan(0)
        }
    })

    test('ERROR_MESSAGE에 누락된 코드가 없다', () => {
        const codeset = new Set(Object.values(ERROR_CODE))
        for (const key of Object.keys(ERROR_MESSAGE)) {
            expect(codeset.has(key as ErrorCode)).toBe(true)
        }
    })
})
