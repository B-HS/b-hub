import { describe, expect, test } from 'bun:test'
import { aiPromptCreateSchema, aiPromptListQuerySchema } from '../../../dto/ai/prompt'

describe('aiPromptCreateSchema', () => {
    test('stage·sortOrder·isActive 기본값으로 파싱한다', () => {
        const r = aiPromptCreateSchema.parse({ name: 'System Base', content: '너는 도우미다' })
        expect(r.stage).toBe('system')
        expect(r.sortOrder).toBe(0)
        expect(r.isActive).toBe(true)
    })

    test('content가 없으면 실패한다', () => {
        expect(() => aiPromptCreateSchema.parse({ name: 'n' })).toThrow()
    })

    test('content가 빈 문자열이면 실패한다', () => {
        expect(() => aiPromptCreateSchema.parse({ name: 'n', content: '' })).toThrow()
    })

    test('name이 없으면 실패한다', () => {
        expect(() => aiPromptCreateSchema.parse({ content: 'c' })).toThrow()
    })

    test('content가 max 20000을 초과하면 실패한다', () => {
        expect(() => aiPromptCreateSchema.parse({ name: 'n', content: 'a'.repeat(20001) })).toThrow()
    })

    test('content 20000 경계값은 허용한다', () => {
        expect(aiPromptCreateSchema.safeParse({ name: 'n', content: 'a'.repeat(20000) }).success).toBe(true)
    })

    test('sortOrder 문자열을 숫자로 강제 변환한다', () => {
        expect(aiPromptCreateSchema.parse({ name: 'n', content: 'c', sortOrder: '7' }).sortOrder).toBe(7)
    })

    test('stage 지정값을 파싱한다', () => {
        expect(aiPromptCreateSchema.parse({ name: 'n', content: 'c', stage: 'assistant' }).stage).toBe('assistant')
    })

    test('알 수 없는 stage는 실패한다', () => {
        expect(() => aiPromptCreateSchema.parse({ name: 'n', content: 'c', stage: 'tool' })).toThrow()
    })
})

describe('aiPromptListQuerySchema', () => {
    test('빈 객체를 파싱한다(모두 선택)', () => {
        expect(aiPromptListQuerySchema.safeParse({}).success).toBe(true)
    })

    test('featureKey·stage를 파싱한다', () => {
        const r = aiPromptListQuerySchema.parse({ featureKey: 'blog', stage: 'context' })
        expect(r.featureKey).toBe('blog')
        expect(r.stage).toBe('context')
    })

    test('알 수 없는 stage는 실패한다', () => {
        expect(aiPromptListQuerySchema.safeParse({ stage: 'nope' }).success).toBe(false)
    })
})
