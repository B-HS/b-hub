import { describe, expect, test } from 'bun:test'
import { escapeLikePattern } from '../../lib/sql-utils'

describe('escapeLikePattern', () => {
    test('% 와일드카드를 이스케이프한다', () => {
        expect(escapeLikePattern('100%')).toBe('100\\%')
    })

    test('_ 와일드카드를 이스케이프한다', () => {
        expect(escapeLikePattern('a_b')).toBe('a\\_b')
    })

    test('백슬래시를 이스케이프한다', () => {
        expect(escapeLikePattern('a\\b')).toBe('a\\\\b')
    })

    test('빈 문자열은 그대로 반환한다', () => {
        expect(escapeLikePattern('')).toBe('')
    })

    test('복합 케이스를 처리한다', () => {
        expect(escapeLikePattern('100% off_sale\\today')).toBe('100\\% off\\_sale\\\\today')
    })

    test('특수 문자 없으면 그대로 반환한다', () => {
        expect(escapeLikePattern('hello world')).toBe('hello world')
    })
})
