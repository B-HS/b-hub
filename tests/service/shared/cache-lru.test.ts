import { describe, expect, test } from 'bun:test'
import { createCache } from '../../../service/shared/cache'

describe('createCache LRU 축출 순서', () => {
    test('get으로 조회한 키는 최신으로 갱신되어 다음 축출 대상에서 제외된다', () => {
        const cache = createCache<string>({ maxSize: 2 })
        cache.set('a', '1')
        cache.set('b', '2')
        expect(cache.get('a')).toBe('1')
        cache.set('c', '3')
        expect(cache.get('b')).toBeNull()
        expect(cache.get('a')).toBe('1')
        expect(cache.get('c')).toBe('3')
    })

    test('같은 키를 다시 set하면 최신으로 갱신된다', () => {
        const cache = createCache<string>({ maxSize: 2 })
        cache.set('a', '1')
        cache.set('b', '2')
        cache.set('a', '1-new')
        cache.set('c', '3')
        expect(cache.get('b')).toBeNull()
        expect(cache.get('a')).toBe('1-new')
        expect(cache.get('c')).toBe('3')
    })

    test('축출은 삽입 순서대로 가장 오래된 키부터 진행된다', () => {
        const cache = createCache<string>({ maxSize: 3 })
        cache.set('a', '1')
        cache.set('b', '2')
        cache.set('c', '3')
        cache.set('d', '4')
        expect(cache.get('a')).toBeNull()
        expect(cache.get('b')).toBe('2')
        expect(cache.get('c')).toBe('3')
        expect(cache.get('d')).toBe('4')
        expect(cache.size()).toBe(3)
    })

    test('만료된 항목을 get하면 즉시 제거되어 size가 줄어든다', async () => {
        const cache = createCache<string>({ maxSize: 10, defaultTtlMs: 30 })
        cache.set('a', '1')
        cache.set('b', '2')
        await new Promise((resolve) => setTimeout(resolve, 40))
        expect(cache.get('a')).toBeNull()
        expect(cache.size()).toBe(1)
        expect(cache.get('b')).toBeNull()
        expect(cache.size()).toBe(0)
    })

    test('del 후 다시 set해도 축출 순서가 어긋나지 않는다', () => {
        const cache = createCache<string>({ maxSize: 2 })
        cache.set('a', '1')
        cache.del('a')
        cache.set('b', '2')
        cache.set('c', '3')
        expect(cache.size()).toBe(2)
        expect(cache.get('b')).toBe('2')
        expect(cache.get('c')).toBe('3')
    })

    test('maxSize를 크게 잡아도 대량 삽입 후 상한을 유지한다', () => {
        const maxSize = 100
        const cache = createCache<number>({ maxSize })
        for (let i = 0; i < 1000; i++) cache.set(`k${i}`, i)
        expect(cache.size()).toBe(maxSize)
        expect(cache.get('k0')).toBeNull()
        expect(cache.get('k999')).toBe(999)
    })
})
