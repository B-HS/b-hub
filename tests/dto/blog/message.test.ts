import { describe, expect, test } from 'bun:test'
import { messageListQuerySchema, messageCreateSchema, messageIdParamSchema } from '../../../dto/blog/message'

const IMAGE_UUID_A = '3f7d6f2c-1a2b-4c3d-8e9f-0a1b2c3d4e5f'
const IMAGE_UUID_B = '9c1e0b74-55aa-4b1c-9d2e-7f6a5b4c3d2e'

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
            imageIds: [IMAGE_UUID_A, IMAGE_UUID_B],
            replyToId: 'msg-parent',
        })
        expect(result.imageIds).toEqual([IMAGE_UUID_A, IMAGE_UUID_B])
        expect(result.replyToId).toBe('msg-parent')
    })

    test('uuid 가 아닌 imageIds 는 실패한다', () => {
        expect(() => messageCreateSchema.parse({ body: 'Hello', imageIds: ['img-1'] })).toThrow()
    })

    test('uuid 와 비-uuid 가 섞여도 실패한다', () => {
        expect(() => messageCreateSchema.parse({ body: 'Hello', imageIds: [IMAGE_UUID_A, 'not-a-uuid'] })).toThrow()
    })

    test('빈 body는 실패한다', () => {
        expect(() => messageCreateSchema.parse({ body: '' })).toThrow()
    })

    test('10000자 초과 body는 실패한다', () => {
        expect(() => messageCreateSchema.parse({ body: 'a'.repeat(10001) })).toThrow()
    })
})
