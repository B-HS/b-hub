import { describe, expect, test } from 'bun:test'
import { storyListQuerySchema, storyIdParamSchema, searchQuerySchema } from '../../../dto/hn/story'

describe('storyListQuerySchema', () => {
    test('기본값으로 파싱한다', () => {
        const result = storyListQuerySchema.parse({})
        expect(result.page).toBe(1)
        expect(result.limit).toBe(20)
        expect(result.type).toBeUndefined()
    })

    test('type을 파싱한다', () => {
        expect(storyListQuerySchema.parse({ type: 'top' }).type).toBe('top')
        expect(storyListQuerySchema.parse({ type: 'best' }).type).toBe('best')
        expect(storyListQuerySchema.parse({ type: 'new' }).type).toBe('new')
    })

    test('잘못된 type은 실패한다', () => {
        expect(() => storyListQuerySchema.parse({ type: 'invalid' })).toThrow()
    })

    test('limit 최대값 검증', () => {
        expect(() => storyListQuerySchema.parse({ limit: '101' })).toThrow()
    })

    test('page 최소값 검증', () => {
        expect(() => storyListQuerySchema.parse({ page: '0' })).toThrow()
    })
})

describe('storyIdParamSchema', () => {
    test('숫자 ID를 파싱한다', () => {
        expect(storyIdParamSchema.parse({ id: '12345' }).id).toBe(12345)
    })
})

describe('searchQuerySchema', () => {
    test('검색어를 파싱한다', () => {
        const result = searchQuerySchema.parse({ q: 'rust' })
        expect(result.q).toBe('rust')
        expect(result.limit).toBe(20)
    })

    test('빈 검색어는 실패한다', () => {
        expect(() => searchQuerySchema.parse({ q: '' })).toThrow()
    })
})
