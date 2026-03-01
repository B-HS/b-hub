import { describe, expect, test } from 'bun:test'
import { spotifyApiKeyCreateSchema } from '../../../dto/spotify/api-key'

describe('spotifyApiKeyCreateSchema', () => {
    test('유효한 입력을 파싱한다', () => {
        const result = spotifyApiKeyCreateSchema.safeParse({ spotifyAccountId: 1, name: 'My Key' })
        expect(result.success).toBe(true)
    })

    test('spotifyAccountId 필수', () => {
        const result = spotifyApiKeyCreateSchema.safeParse({ name: 'Key' })
        expect(result.success).toBe(false)
    })

    test('name은 선택', () => {
        const result = spotifyApiKeyCreateSchema.safeParse({ spotifyAccountId: 1 })
        expect(result.success).toBe(true)
    })
})
