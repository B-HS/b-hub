import { describe, expect, test } from 'bun:test'
import { aiChatSendSchema, aiCompletionSchema, aiMessageListQuerySchema } from '../../../dto/ai/chat'

describe('aiChatSendSchema', () => {
    test('content만으로 파싱한다', () => {
        const r = aiChatSendSchema.parse({ content: '안녕' })
        expect(r.content).toBe('안녕')
    })

    test('content가 없으면 실패한다', () => {
        expect(() => aiChatSendSchema.parse({})).toThrow()
    })

    test('content가 빈 문자열이면 실패한다', () => {
        expect(() => aiChatSendSchema.parse({ content: '' })).toThrow()
    })

    test('attachmentIds 문자열을 숫자로 강제 변환한다', () => {
        expect(aiChatSendSchema.parse({ content: 'x', attachmentIds: ['3', '4'] }).attachmentIds).toEqual([3, 4])
    })

    test('attachmentIds가 20개를 초과하면 실패한다', () => {
        const ids = Array.from({ length: 21 }, (_, i) => i + 1)
        expect(() => aiChatSendSchema.parse({ content: 'x', attachmentIds: ids })).toThrow()
    })

    test('temperature 범위(0~2)를 벗어나면 실패한다', () => {
        expect(() => aiChatSendSchema.parse({ content: 'x', temperature: 3 })).toThrow()
    })

    test('temperature 문자열을 숫자로 강제 변환한다', () => {
        expect(aiChatSendSchema.parse({ content: 'x', temperature: '1.5' }).temperature).toBe(1.5)
    })

    test('maxTokens가 최대값(32000)을 초과하면 실패한다', () => {
        expect(() => aiChatSendSchema.parse({ content: 'x', maxTokens: 40000 })).toThrow()
    })
})

describe('aiCompletionSchema', () => {
    test('provider·modelId·messages를 파싱한다', () => {
        const r = aiCompletionSchema.parse({ provider: 'anthropic', modelId: 'claude', messages: [{ role: 'user', content: 'hi' }] })
        expect(r.messages).toHaveLength(1)
        expect(r.messages[0].role).toBe('user')
    })

    test('messages가 빈 배열이면 실패한다', () => {
        expect(() => aiCompletionSchema.parse({ provider: 'anthropic', modelId: 'm', messages: [] })).toThrow()
    })

    test('알 수 없는 role은 실패한다', () => {
        expect(() => aiCompletionSchema.parse({ provider: 'anthropic', modelId: 'm', messages: [{ role: 'tool', content: 'x' }] })).toThrow()
    })

    test('알 수 없는 provider는 실패한다', () => {
        expect(() => aiCompletionSchema.parse({ provider: 'openai', modelId: 'm', messages: [{ role: 'user', content: 'x' }] })).toThrow()
    })
})

describe('aiMessageListQuerySchema', () => {
    test('기본값(page 1, limit 50)으로 파싱한다', () => {
        const r = aiMessageListQuerySchema.parse({})
        expect(r.page).toBe(1)
        expect(r.limit).toBe(50)
    })

    test('limit 최대값(100)을 초과하면 실패한다', () => {
        expect(() => aiMessageListQuerySchema.parse({ limit: '101' })).toThrow()
    })
})
