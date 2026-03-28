import { describe, expect, test } from 'bun:test'
import { createGroupSchema, updateGroupSchema } from '../../../dto/calendar-group'

describe('createGroupSchema', () => {
    test('유효한 입력을 파싱한다', () => {
        const result = createGroupSchema.safeParse({
            name: '개인',
            color: 'bg-blue-500',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.name).toBe('개인')
            expect(result.data.color).toBe('bg-blue-500')
        }
    })

    test('name이 비어있으면 실패한다', () => {
        const result = createGroupSchema.safeParse({
            name: '',
            color: 'bg-blue-500',
        })
        expect(result.success).toBe(false)
    })

    test('name이 255자를 초과하면 실패한다', () => {
        const result = createGroupSchema.safeParse({
            name: 'a'.repeat(256),
            color: 'bg-blue-500',
        })
        expect(result.success).toBe(false)
    })

    test('color가 비어있으면 실패한다', () => {
        const result = createGroupSchema.safeParse({
            name: '개인',
            color: '',
        })
        expect(result.success).toBe(false)
    })

    test('color가 50자를 초과하면 실패한다', () => {
        const result = createGroupSchema.safeParse({
            name: '개인',
            color: 'a'.repeat(51),
        })
        expect(result.success).toBe(false)
    })
})

describe('updateGroupSchema', () => {
    test('모든 필드가 선택적이다', () => {
        const result = updateGroupSchema.safeParse({})
        expect(result.success).toBe(true)
    })

    test('name만 수정할 수 있다', () => {
        const result = updateGroupSchema.safeParse({ name: '변경된 이름' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.name).toBe('변경된 이름')
        }
    })

    test('sortOrder를 수정할 수 있다', () => {
        const result = updateGroupSchema.safeParse({ sortOrder: 5 })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.sortOrder).toBe(5)
        }
    })

    test('isVisible을 수정할 수 있다', () => {
        const result = updateGroupSchema.safeParse({ isVisible: false })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.isVisible).toBe(false)
        }
    })
})
