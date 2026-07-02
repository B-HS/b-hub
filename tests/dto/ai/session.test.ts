import { describe, expect, test } from 'bun:test'
import { aiSessionCreateSchema, aiSessionListQuerySchema } from '../../../dto/ai/session'

describe('aiSessionCreateSchema', () => {
    test('provider·modelId·promptIds를 파싱한다', () => {
        const r = aiSessionCreateSchema.parse({ provider: 'codex', modelId: 'gpt-5', promptIds: ['1', '2'] })
        expect(r.provider).toBe('codex')
        expect(r.modelId).toBe('gpt-5')
        expect(r.promptIds).toEqual([1, 2])
    })

    test('modelId가 없으면 실패한다', () => {
        expect(() => aiSessionCreateSchema.parse({ provider: 'anthropic' })).toThrow()
    })

    test('알 수 없는 provider는 실패한다', () => {
        expect(() => aiSessionCreateSchema.parse({ provider: 'openai', modelId: 'm' })).toThrow()
    })

    test('promptIds는 선택이며 없이도 파싱한다', () => {
        const r = aiSessionCreateSchema.parse({ provider: 'ollama', modelId: 'llama3' })
        expect(r.promptIds).toBeUndefined()
    })

    test('promptIds가 50개를 초과하면 실패한다', () => {
        const ids = Array.from({ length: 51 }, (_, i) => i + 1)
        expect(() => aiSessionCreateSchema.parse({ provider: 'codex', modelId: 'm', promptIds: ids })).toThrow()
    })
})

describe('aiSessionListQuerySchema', () => {
    test('기본값(page 1, limit 20)으로 파싱한다', () => {
        const r = aiSessionListQuerySchema.parse({})
        expect(r.page).toBe(1)
        expect(r.limit).toBe(20)
    })

    test('page·limit 문자열을 숫자로 강제 변환한다', () => {
        const r = aiSessionListQuerySchema.parse({ page: '3', limit: '50' })
        expect(r.page).toBe(3)
        expect(r.limit).toBe(50)
    })

    test('limit 최대값(100)을 초과하면 실패한다', () => {
        expect(() => aiSessionListQuerySchema.parse({ limit: '101' })).toThrow()
    })
})
