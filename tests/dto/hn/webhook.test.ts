import { describe, expect, test } from 'bun:test'
import { webhookCreateSchema, webhookDeleteByUrlSchema } from '../../../dto/hn/webhook'

describe('webhookCreateSchema', () => {
    test('유효한 URL로 파싱한다', () => {
        const result = webhookCreateSchema.parse({
            url: 'https://discord.com/api/webhooks/123',
        })
        expect(result.url).toBe('https://discord.com/api/webhooks/123')
        expect(result.digestTypes).toEqual(['daily', 'weekly', 'monthly'])
    })

    test('커스텀 digestTypes를 파싱한다', () => {
        const result = webhookCreateSchema.parse({
            url: 'https://example.com',
            digestTypes: ['daily'],
        })
        expect(result.digestTypes).toEqual(['daily'])
    })

    test('잘못된 URL은 실패한다', () => {
        expect(() => webhookCreateSchema.parse({ url: 'not-a-url' })).toThrow()
    })

    test('URL이 없으면 실패한다', () => {
        expect(() => webhookCreateSchema.parse({})).toThrow()
    })

    test('private IP URL을 거부한다', () => {
        expect(() => webhookCreateSchema.parse({ url: 'https://127.0.0.1/hook' })).toThrow()
        expect(() => webhookCreateSchema.parse({ url: 'https://10.0.0.1/hook' })).toThrow()
        expect(() => webhookCreateSchema.parse({ url: 'https://192.168.1.1/hook' })).toThrow()
        expect(() => webhookCreateSchema.parse({ url: 'https://172.16.0.1/hook' })).toThrow()
    })

    test('http:// URL을 거부한다', () => {
        expect(() => webhookCreateSchema.parse({ url: 'http://example.com/hook' })).toThrow()
    })

    test('localhost URL을 거부한다', () => {
        expect(() => webhookCreateSchema.parse({ url: 'https://localhost/hook' })).toThrow()
        expect(() => webhookCreateSchema.parse({ url: 'https://0.0.0.0/hook' })).toThrow()
    })
})

describe('webhookDeleteByUrlSchema', () => {
    test('URL을 파싱한다', () => {
        const result = webhookDeleteByUrlSchema.parse({
            url: 'https://example.com',
        })
        expect(result.url).toBe('https://example.com')
    })
})
