import { describe, test, expect } from 'bun:test'
import { computeThreadIds } from '../../lib/mail-thread'

const msg = (id: number, messageIdHeader: string | null, inReplyTo: string | null, referencesHeader: string | null, receivedAt: string | null) => ({
    id,
    messageIdHeader,
    inReplyTo,
    referencesHeader,
    receivedAt: receivedAt ? new Date(receivedAt) : null,
    sentAt: null,
})

describe('computeThreadIds', () => {
    test('inReplyTo 체인(references 없음)을 transitive하게 한 thread로 묶는다', () => {
        const result = computeThreadIds([
            msg(1, '<a@x>', null, null, '2024-01-01'),
            msg(2, '<b@x>', '<a@x>', null, '2024-01-02'),
            msg(3, '<c@x>', '<b@x>', null, '2024-01-03'),
        ])
        expect(result.get(1)).toBe('<a@x>')
        expect(result.get(2)).toBe('<a@x>')
        expect(result.get(3)).toBe('<a@x>')
    })

    test('references 헤더로 깊은 체인을 묶는다', () => {
        const result = computeThreadIds([
            msg(1, '<a@x>', null, null, '2024-01-01'),
            msg(2, '<b@x>', '<a@x>', '<a@x>', '2024-01-02'),
            msg(3, '<c@x>', '<b@x>', '<a@x> <b@x>', '2024-01-03'),
        ])
        expect(result.get(1)).toBe('<a@x>')
        expect(result.get(3)).toBe('<a@x>')
    })

    test('보낸 메일과 받은 메일을 같은 thread로 묶는다', () => {
        const result = computeThreadIds([
            msg(1, '<sent@me>', null, null, '2024-01-01'),
            msg(2, '<reply@them>', '<sent@me>', null, '2024-01-02'),
        ])
        expect(result.get(1)).toBe(result.get(2))
        expect(result.get(1)).toBe('<sent@me>')
    })

    test('서로 다른 대화는 분리한다', () => {
        const result = computeThreadIds([
            msg(1, '<a@x>', null, null, '2024-01-01'),
            msg(2, '<b@x>', '<a@x>', null, '2024-01-02'),
            msg(10, '<p@x>', null, null, '2024-02-01'),
            msg(11, '<q@x>', '<p@x>', null, '2024-02-02'),
        ])
        expect(result.get(1)).toBe(result.get(2))
        expect(result.get(10)).toBe(result.get(11))
        expect(result.get(1)).not.toBe(result.get(10))
    })

    test('단일 메일은 자기 messageId를 threadId로 한다', () => {
        const result = computeThreadIds([msg(1, '<solo@x>', null, null, '2024-01-01')])
        expect(result.get(1)).toBe('<solo@x>')
    })

    test('messageId가 없는 메일은 결과에서 제외한다', () => {
        const result = computeThreadIds([msg(1, null, null, null, '2024-01-01')])
        expect(result.has(1)).toBe(false)
    })

    test('백필 threadId는 새 메일의 deriveThreadId(references[0])와 일치한다', () => {
        const result = computeThreadIds([
            msg(1, '<a@x>', null, null, '2024-01-01'),
            msg(2, '<b@x>', '<a@x>', '<a@x>', '2024-01-02'),
        ])
        expect(result.get(2)).toBe('<a@x>')
    })

    test('수신 순서가 뒤섞여 들어와도 가장 오래된 메일을 root로 삼는다', () => {
        const result = computeThreadIds([
            msg(3, '<c@x>', '<b@x>', '<a@x> <b@x>', '2024-01-03'),
            msg(1, '<a@x>', null, null, '2024-01-01'),
            msg(2, '<b@x>', '<a@x>', '<a@x>', '2024-01-02'),
        ])
        expect(result.get(1)).toBe('<a@x>')
        expect(result.get(2)).toBe('<a@x>')
        expect(result.get(3)).toBe('<a@x>')
    })
})
