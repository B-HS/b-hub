import { describe, expect, test } from 'bun:test'
import { createCache } from '../../../service/shared/cache'

describe('createCache', () => {
    test('set과 get으로 값을 저장하고 조회한다', () => {
        const cache = createCache<string>()
        cache.set('key1', 'value1')
        expect(cache.get('key1')).toBe('value1')
    })

    test('존재하지 않는 키는 null을 반환한다', () => {
        const cache = createCache<string>()
        expect(cache.get('nonexistent')).toBeNull()
    })

    test('TTL 만료 후 null을 반환한다', async () => {
        const cache = createCache<string>({ defaultTtlMs: 50 })
        cache.set('key1', 'value1')
        expect(cache.get('key1')).toBe('value1')
        await new Promise((resolve) => setTimeout(resolve, 60))
        expect(cache.get('key1')).toBeNull()
    })

    test('커스텀 TTL을 적용한다', async () => {
        const cache = createCache<string>({ defaultTtlMs: 5000 })
        cache.set('key1', 'value1', 50)
        expect(cache.get('key1')).toBe('value1')
        await new Promise((resolve) => setTimeout(resolve, 60))
        expect(cache.get('key1')).toBeNull()
    })

    test('maxSize를 초과하면 오래된 항목을 제거한다', () => {
        const cache = createCache<string>({ maxSize: 2 })
        cache.set('a', '1')
        cache.set('b', '2')
        cache.set('c', '3')
        expect(cache.get('a')).toBeNull()
        expect(cache.get('b')).toBe('2')
        expect(cache.get('c')).toBe('3')
    })

    test('del로 항목을 삭제한다', () => {
        const cache = createCache<string>()
        cache.set('key1', 'value1')
        cache.del('key1')
        expect(cache.get('key1')).toBeNull()
    })

    test('clear로 모든 항목을 삭제한다', () => {
        const cache = createCache<string>()
        cache.set('a', '1')
        cache.set('b', '2')
        cache.clear()
        expect(cache.size()).toBe(0)
    })

    test('size가 정확하다', () => {
        const cache = createCache<string>()
        expect(cache.size()).toBe(0)
        cache.set('a', '1')
        expect(cache.size()).toBe(1)
        cache.set('b', '2')
        expect(cache.size()).toBe(2)
    })

    test('has가 올바르게 동작한다', () => {
        const cache = createCache<string>()
        cache.set('a', '1')
        expect(cache.has('a')).toBe(true)
        expect(cache.has('b')).toBe(false)
    })

    test('같은 키로 set하면 값이 덮어쓰인다', () => {
        const cache = createCache<string>()
        cache.set('a', '1')
        cache.set('a', '2')
        expect(cache.get('a')).toBe('2')
        expect(cache.size()).toBe(1)
    })
})
