import { describe, expect, test } from 'bun:test'
import { tagCreateSchema, tagIdParamSchema } from '../../../dto/blog/tag'

describe('tagCreateSchema', () => {
    test('유효한 태그명을 파싱한다', () => {
        const result = tagCreateSchema.parse({ tag: 'TypeScript' })
        expect(result.tag).toBe('TypeScript')
    })

    test('빈 태그명은 실패한다', () => {
        expect(() => tagCreateSchema.parse({ tag: '' })).toThrow()
    })

    test('255자 초과하면 실패한다', () => {
        expect(() => tagCreateSchema.parse({ tag: 'a'.repeat(256) })).toThrow()
    })

    test('태그명이 없으면 실패한다', () => {
        expect(() => tagCreateSchema.parse({})).toThrow()
    })
})

describe('tagIdParamSchema', () => {
    test('유효한 ID를 파싱한다', () => {
        const result = tagIdParamSchema.parse({ id: '3' })
        expect(result.id).toBe(3)
    })
})
