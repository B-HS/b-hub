import { describe, expect, test } from 'bun:test'
import { spotifyWidgetTokenCreateSchema, spotifyWidgetTokenToggleSchema } from '../../../dto/spotify/widget-token'

describe('spotifyWidgetTokenCreateSchema', () => {
    test('유효한 입력을 파싱한다', () => {
        const result = spotifyWidgetTokenCreateSchema.safeParse({ spotifyAccountId: 1, name: 'My Widget' })
        expect(result.success).toBe(true)
    })

    test('spotifyAccountId 필수', () => {
        const result = spotifyWidgetTokenCreateSchema.safeParse({ name: 'Widget' })
        expect(result.success).toBe(false)
    })

    test('name은 선택', () => {
        const result = spotifyWidgetTokenCreateSchema.safeParse({ spotifyAccountId: 1 })
        expect(result.success).toBe(true)
    })
})

describe('spotifyWidgetTokenToggleSchema', () => {
    test('유효한 입력을 파싱한다', () => {
        const result = spotifyWidgetTokenToggleSchema.safeParse({ isActive: false })
        expect(result.success).toBe(true)
    })

    test('isActive 필수', () => {
        const result = spotifyWidgetTokenToggleSchema.safeParse({})
        expect(result.success).toBe(false)
    })
})
