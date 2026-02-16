import { describe, expect, test } from 'bun:test'
import { postListQuerySchema, postCreateSchema, postUpdateSchema, postIdParamSchema } from '../../../dto/blog/post'

describe('postListQuerySchema', () => {
    test('기본값을 적용한다', () => {
        const result = postListQuerySchema.parse({})
        expect(result.page).toBe(1)
        expect(result.limit).toBe(20)
    })

    test('커스텀 값을 파싱한다', () => {
        const result = postListQuerySchema.parse({
            page: '2',
            limit: '10',
            keyword: 'test',
        })
        expect(result.page).toBe(2)
        expect(result.limit).toBe(10)
        expect(result.keyword).toBe('test')
    })

    test('categoryId 필터를 파싱한다', () => {
        const result = postListQuerySchema.parse({ categoryId: '3' })
        expect(result.categoryId).toBe(3)
    })

    test('tagId 필터를 파싱한다', () => {
        const result = postListQuerySchema.parse({ tagId: '5' })
        expect(result.tagId).toBe(5)
    })

    test('boolean 필터를 파싱한다', () => {
        const result = postListQuerySchema.parse({
            isPublished: 'true',
            isHide: 'false',
        })
        expect(result.isPublished).toBe(true)
        expect(result.isHide).toBe(false)
    })

    test('limit 최대값을 제한한다', () => {
        expect(() => postListQuerySchema.parse({ limit: '101' })).toThrow()
    })

    test('page는 양수여야 한다', () => {
        expect(() => postListQuerySchema.parse({ page: '0' })).toThrow()
    })
})

describe('postIdParamSchema', () => {
    test('유효한 ID를 파싱한다', () => {
        const result = postIdParamSchema.parse({ id: '42' })
        expect(result.id).toBe(42)
    })

    test('음수 ID는 실패한다', () => {
        expect(() => postIdParamSchema.parse({ id: '-1' })).toThrow()
    })
})

describe('postCreateSchema', () => {
    test('유효한 데이터를 파싱한다', () => {
        const result = postCreateSchema.parse({
            title: 'Test Post',
            description: 'Content',
            categoryId: 1,
            tagIds: [1, 2],
            isPublished: true,
        })
        expect(result.title).toBe('Test Post')
        expect(result.tagIds).toEqual([1, 2])
    })

    test('기본값을 적용한다', () => {
        const result = postCreateSchema.parse({
            title: 'Test',
            description: 'Content',
            categoryId: 1,
        })
        expect(result.tagIds).toEqual([])
        expect(result.isPublished).toBe(false)
    })

    test('제목이 없으면 실패한다', () => {
        expect(() => postCreateSchema.parse({ description: 'Content', categoryId: 1 })).toThrow()
    })

    test('제목이 255자를 초과하면 실패한다', () => {
        expect(() =>
            postCreateSchema.parse({
                title: 'a'.repeat(256),
                description: 'Content',
                categoryId: 1,
            }),
        ).toThrow()
    })

    test('categoryId가 없으면 실패한다', () => {
        expect(() => postCreateSchema.parse({ title: 'Test', description: 'Content' })).toThrow()
    })
})

describe('postUpdateSchema', () => {
    test('부분 업데이트를 파싱한다', () => {
        const result = postUpdateSchema.parse({ title: 'Updated' })
        expect(result.title).toBe('Updated')
        expect(result.description).toBeUndefined()
    })

    test('빈 객체를 파싱한다', () => {
        const result = postUpdateSchema.parse({})
        expect(result.title).toBeUndefined()
    })

    test('모든 필드를 파싱한다', () => {
        const result = postUpdateSchema.parse({
            title: 'Updated',
            description: 'New content',
            categoryId: 2,
            tagIds: [3],
            isPublished: true,
            isHide: false,
            isNotice: true,
            isComment: false,
        })
        expect(result.isNotice).toBe(true)
        expect(result.isComment).toBe(false)
    })
})
