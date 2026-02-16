import { describe, expect, test } from 'bun:test'
import { messageListQuerySchema, messageCreateSchema, messageIdParamSchema } from '../../../dto/blog/message'

describe('messageListQuerySchema', () => {
    test('기본값을 적용한다', () => {
        const result = messageListQuerySchema.parse({ userId: 'user-1' })
        expect(result.page).toBe(1)
        expect(result.size).toBe(20)
    })

    test('커스텀 값을 파싱한다', () => {
        const result = messageListQuerySchema.parse({
            userId: 'user-1',
            page: '3',
            size: '50',
        })
        expect(result.page).toBe(3)
        expect(result.size).toBe(50)
    })

    test('userId가 없으면 실패한다', () => {
        expect(() => messageListQuerySchema.parse({})).toThrow()
    })

    test('size 최대값을 제한한다', () => {
        expect(() => messageListQuerySchema.parse({ userId: 'user-1', size: '101' })).toThrow()
    })
})

describe('messageIdParamSchema', () => {
    test('유효한 ID를 파싱한다', () => {
        const result = messageIdParamSchema.parse({ id: 'msg-uuid-123' })
        expect(result.id).toBe('msg-uuid-123')
    })

    test('빈 ID는 실패한다', () => {
        expect(() => messageIdParamSchema.parse({ id: '' })).toThrow()
    })
})

describe('messageCreateSchema', () => {
    test('유효한 데이터를 파싱한다', () => {
        const result = messageCreateSchema.parse({ body: 'Hello world' })
        expect(result.body).toBe('Hello world')
        expect(result.imageIds).toEqual([])
        expect(result.replyToId).toBeNull()
        expect(result.retweetOfId).toBeNull()
    })

    test('이미지와 답글을 포함할 수 있다', () => {
        const result = messageCreateSchema.parse({
            body: 'Reply with images',
            imageIds: ['img-1', 'img-2'],
            replyToId: 'msg-parent',
        })
        expect(result.imageIds).toEqual(['img-1', 'img-2'])
        expect(result.replyToId).toBe('msg-parent')
    })

    test('빈 body는 실패한다', () => {
        expect(() => messageCreateSchema.parse({ body: '' })).toThrow()
    })

    test('10000자 초과 body는 실패한다', () => {
        expect(() => messageCreateSchema.parse({ body: 'a'.repeat(10001) })).toThrow()
    })
})
