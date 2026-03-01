import { describe, expect, test } from 'bun:test'
import { playlistsQuerySchema } from '../../../dto/spotify/data'

describe('playlistsQuerySchema', () => {
    test('기본값으로 파싱한다', () => {
        const result = playlistsQuerySchema.safeParse({})
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.limit).toBe(20)
            expect(result.data.offset).toBe(0)
        }
    })

    test('limit 최대 50', () => {
        const result = playlistsQuerySchema.safeParse({ limit: '51' })
        expect(result.success).toBe(false)
    })

    test('offset 최소 0', () => {
        const result = playlistsQuerySchema.safeParse({ offset: '-1' })
        expect(result.success).toBe(false)
    })
})
