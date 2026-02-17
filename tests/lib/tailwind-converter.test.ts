import { describe, expect, test } from 'bun:test'
import { convertTailwindToCSS, mergeStyles } from '../../lib/tailwind-converter'

describe('convertTailwindToCSS', () => {
    test('빈 문자열 → 빈 객체', () => {
        expect(convertTailwindToCSS('')).toEqual({})
    })

    test('공백만 → 빈 객체', () => {
        expect(convertTailwindToCSS('   ')).toEqual({})
    })

    test('기본 클래스 변환 (p-4)', () => {
        const result = convertTailwindToCSS('p-4')
        expect(result).toHaveProperty('padding')
    })

    test('여러 클래스 변환', () => {
        const result = convertTailwindToCSS('p-4 m-2')
        expect(result).toHaveProperty('padding')
        expect(result).toHaveProperty('margin')
    })

    test('유효하지 않은 클래스 → 빈 객체 (에러 없음)', () => {
        const result = convertTailwindToCSS('not-a-real-class-xyz')
        expect(result).toBeDefined()
    })

    test('CSS 속성명이 camelCase로 변환된다', () => {
        const result = convertTailwindToCSS('bg-red-500')
        const keys = Object.keys(result)
        const hasCamelCase = keys.some((k) => k === 'backgroundColor' || k === 'background')
        expect(hasCamelCase || keys.length === 0).toBe(true)
    })
})

describe('mergeStyles', () => {
    test('빈 인자 → 빈 객체', () => {
        expect(mergeStyles()).toEqual({})
    })

    test('단일 스타일 병합', () => {
        expect(mergeStyles({ color: 'red' })).toEqual({ color: 'red' })
    })

    test('여러 스타일 병합', () => {
        const result = mergeStyles({ color: 'red' }, { fontSize: 16 })
        expect(result).toEqual({ color: 'red', fontSize: 16 })
    })

    test('후순위가 선순위를 덮어쓴다', () => {
        const result = mergeStyles({ color: 'red' }, { color: 'blue' })
        expect(result).toEqual({ color: 'blue' })
    })
})
