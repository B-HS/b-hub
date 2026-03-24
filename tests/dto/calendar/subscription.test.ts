import { describe, expect, test } from 'bun:test'
import { createSubscriptionSchema } from '../../../dto/calendar-subscription'

describe('createSubscriptionSchema', () => {
    test('name 없이 파싱한다', () => {
        const result = createSubscriptionSchema.safeParse({})
        expect(result.success).toBe(true)
    })

    test('name을 포함하여 파싱한다', () => {
        const result = createSubscriptionSchema.safeParse({ name: 'My Calendar' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.name).toBe('My Calendar')
        }
    })

    test('name이 255자를 초과하면 실패한다', () => {
        const result = createSubscriptionSchema.safeParse({ name: 'a'.repeat(256) })
        expect(result.success).toBe(false)
    })

    test('name이 255자 이하이면 성공한다', () => {
        const result = createSubscriptionSchema.safeParse({ name: 'a'.repeat(255) })
        expect(result.success).toBe(true)
    })

    test('name이 빈 문자열이면 허용한다', () => {
        const result = createSubscriptionSchema.safeParse({ name: '' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.name).toBe('')
        }
    })

    test('name에 특수문자를 허용한다', () => {
        const result = createSubscriptionSchema.safeParse({ name: 'My Cal<>&' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.name).toBe('My Cal<>&')
        }
    })

    test('추가 필드를 무시한다', () => {
        const result = createSubscriptionSchema.safeParse({ name: 'test', extra: true })
        expect(result.success).toBe(true)
        if (result.success) {
            expect((result.data as Record<string, unknown>).extra).toBeUndefined()
        }
    })
})
