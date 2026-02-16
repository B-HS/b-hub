import { describe, expect, test } from 'bun:test'
import { commentListQuerySchema, commentCreateSchema, commentUpdateSchema, commentIdParamSchema } from '../../../dto/blog/comment'

describe('commentListQuerySchema', () => {
    test('postId를 파싱한다', () => {
        const result = commentListQuerySchema.parse({ postId: '42' })
        expect(result.postId).toBe(42)
    })

    test('postId가 없으면 실패한다', () => {
        expect(() => commentListQuerySchema.parse({})).toThrow()
    })
})

describe('commentIdParamSchema', () => {
    test('유효한 ID를 파싱한다', () => {
        const result = commentIdParamSchema.parse({ id: '10' })
        expect(result.id).toBe(10)
    })
})

describe('commentCreateSchema', () => {
    test('유효한 데이터를 파싱한다', () => {
        const result = commentCreateSchema.parse({
            postId: 1,
            comment: 'Great post!',
        })
        expect(result.postId).toBe(1)
        expect(result.comment).toBe('Great post!')
        expect(result.isHide).toBe(false)
    })

    test('isHide를 지정할 수 있다', () => {
        const result = commentCreateSchema.parse({
            postId: 1,
            comment: 'Hidden comment',
            isHide: true,
        })
        expect(result.isHide).toBe(true)
    })

    test('빈 댓글은 실패한다', () => {
        expect(() => commentCreateSchema.parse({ postId: 1, comment: '' })).toThrow()
    })

    test('5000자 초과 댓글은 실패한다', () => {
        expect(() => commentCreateSchema.parse({ postId: 1, comment: 'a'.repeat(5001) })).toThrow()
    })
})

describe('commentUpdateSchema', () => {
    test('부분 업데이트를 파싱한다', () => {
        const result = commentUpdateSchema.parse({ comment: 'Updated' })
        expect(result.comment).toBe('Updated')
    })

    test('isHide만 업데이트할 수 있다', () => {
        const result = commentUpdateSchema.parse({ isHide: true })
        expect(result.isHide).toBe(true)
        expect(result.comment).toBeUndefined()
    })
})
