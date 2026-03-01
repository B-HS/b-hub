import { describe, expect, test } from 'bun:test'
import { spotifyAccountUpdateSchema, spotifyAccountParamSchema } from '../../../dto/spotify/account'

describe('spotifyAccountUpdateSchema', () => {
    test('유효한 입력을 파싱한다', () => {
        const result = spotifyAccountUpdateSchema.safeParse({ displayName: 'Test', isActive: false })
        expect(result.success).toBe(true)
    })

    test('빈 객체를 허용한다', () => {
        const result = spotifyAccountUpdateSchema.safeParse({})
        expect(result.success).toBe(true)
    })

    test('displayName 100자 초과 시 실패한다', () => {
        const result = spotifyAccountUpdateSchema.safeParse({ displayName: 'a'.repeat(101) })
        expect(result.success).toBe(false)
    })
})

describe('spotifyAccountParamSchema', () => {
    test('숫자를 파싱한다', () => {
        const result = spotifyAccountParamSchema.safeParse({ accountId: '1' })
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.accountId).toBe(1)
    })

    test('0 이하는 실패한다', () => {
        const result = spotifyAccountParamSchema.safeParse({ accountId: '0' })
        expect(result.success).toBe(false)
    })
})
