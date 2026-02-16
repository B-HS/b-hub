import { describe, expect, test } from 'bun:test'
import { badgeImageQuerySchema, badgeFontsResponseSchema } from '../../dto/badge'

describe('badgeImageQuerySchema', () => {
    test('기본값으로 파싱한다', () => {
        const result = badgeImageQuerySchema.parse({})
        expect(result.width).toBe(800)
        expect(result.height).toBe(250)
        expect(result.text).toBe('Badge')
        expect(result.font).toBe('Inter')
        expect(result.fontSize).toBeUndefined()
        expect(result.fontWeight).toBe(400)
        expect(result.color).toBe('#000000')
        expect(result.backgroundColor).toBe('#ffffff')
        expect(result.icon).toBe('')
        expect(result.iconUrl).toBe('')
        expect(result.iconSize).toBe(0)
        expect(result.tailwind).toBe('')
        expect(result.css).toBe('{}')
    })

    test('커스텀 값으로 파싱한다', () => {
        const result = badgeImageQuerySchema.parse({
            width: '400',
            height: '100',
            text: 'Hello',
            font: 'Noto Sans KR',
            fontSize: '24',
            fontWeight: '700',
            color: '#ff0000',
            backgroundColor: '#00ff00',
            icon: 'github',
            iconSize: '32',
        })
        expect(result.width).toBe(400)
        expect(result.height).toBe(100)
        expect(result.text).toBe('Hello')
        expect(result.font).toBe('Noto Sans KR')
        expect(result.fontSize).toBe(24)
        expect(result.fontWeight).toBe(700)
        expect(result.color).toBe('#ff0000')
        expect(result.icon).toBe('github')
        expect(result.iconSize).toBe(32)
    })

    test('width 최소값 검증', () => {
        expect(() => badgeImageQuerySchema.parse({ width: '0' })).toThrow()
    })

    test('width 최대값 검증', () => {
        expect(() => badgeImageQuerySchema.parse({ width: '4097' })).toThrow()
    })

    test('height 최소값 검증', () => {
        expect(() => badgeImageQuerySchema.parse({ height: '0' })).toThrow()
    })

    test('height 최대값 검증', () => {
        expect(() => badgeImageQuerySchema.parse({ height: '4097' })).toThrow()
    })

    test('fontSize 최소값 검증', () => {
        expect(() => badgeImageQuerySchema.parse({ fontSize: '0' })).toThrow()
    })

    test('fontSize 최대값 검증', () => {
        expect(() => badgeImageQuerySchema.parse({ fontSize: '501' })).toThrow()
    })

    test('fontWeight 범위 검증', () => {
        expect(() => badgeImageQuerySchema.parse({ fontWeight: '99' })).toThrow()
        expect(() => badgeImageQuerySchema.parse({ fontWeight: '901' })).toThrow()
    })

    test('문자열을 숫자로 변환한다', () => {
        const result = badgeImageQuerySchema.parse({ width: '500', height: '200' })
        expect(typeof result.width).toBe('number')
        expect(typeof result.height).toBe('number')
    })
})

describe('badgeFontsResponseSchema', () => {
    test('올바른 폰트 응답을 파싱한다', () => {
        const result = badgeFontsResponseSchema.parse({
            local: [{ name: 'Inter', weights: [400, 700] }],
            googleFontsSupported: true,
        })
        expect(result.local).toHaveLength(1)
        expect(result.googleFontsSupported).toBe(true)
    })

    test('빈 배열도 유효하다', () => {
        const result = badgeFontsResponseSchema.parse({
            local: [],
            googleFontsSupported: false,
        })
        expect(result.local).toHaveLength(0)
    })

    test('필수 필드가 없으면 실패한다', () => {
        expect(() => badgeFontsResponseSchema.parse({})).toThrow()
        expect(() => badgeFontsResponseSchema.parse({ local: [] })).toThrow()
    })
})
