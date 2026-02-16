import { describe, expect, test } from 'bun:test'
import { categoryCreateSchema, categoryIdParamSchema } from '../../../dto/blog/category'

describe('categoryCreateSchema', () => {
    test('유효한 카테고리명을 파싱한다', () => {
        const result = categoryCreateSchema.parse({ category: 'Tech' })
        expect(result.category).toBe('Tech')
    })

    test('빈 카테고리명은 실패한다', () => {
        expect(() => categoryCreateSchema.parse({ category: '' })).toThrow()
    })

    test('255자 초과하면 실패한다', () => {
        expect(() => categoryCreateSchema.parse({ category: 'a'.repeat(256) })).toThrow()
    })

    test('카테고리명이 없으면 실패한다', () => {
        expect(() => categoryCreateSchema.parse({})).toThrow()
    })
})

describe('categoryIdParamSchema', () => {
    test('유효한 ID를 파싱한다', () => {
        const result = categoryIdParamSchema.parse({ id: '5' })
        expect(result.id).toBe(5)
    })

    test('음수 ID는 실패한다', () => {
        expect(() => categoryIdParamSchema.parse({ id: '-1' })).toThrow()
    })
})
