import { describe, expect, test } from 'bun:test'
import { createBoundedLruCache } from '../../deploy/upload-server/gdrive-client'

describe('createBoundedLruCache', () => {
    test('저장한 값을 그대로 돌려주고 없는 키는 undefined 를 반환한다', () => {
        const cache = createBoundedLruCache(2)
        cache.set('a', '1')

        expect(cache.get('a')).toBe('1')
        expect(cache.get('b')).toBeUndefined()
    })

    test('상한을 넘으면 가장 오래된 항목부터 제거한다', () => {
        const cache = createBoundedLruCache(2)
        cache.set('a', '1')
        cache.set('b', '2')
        cache.set('c', '3')

        expect(cache.size).toBe(2)
        expect(cache.has('a')).toBe(false)
        expect(cache.get('b')).toBe('2')
        expect(cache.get('c')).toBe('3')
    })

    test('조회한 항목은 최근 사용으로 승격되어 제거 대상에서 밀린다', () => {
        const cache = createBoundedLruCache(2)
        cache.set('a', '1')
        cache.set('b', '2')
        cache.get('a')
        cache.set('c', '3')

        expect(cache.has('a')).toBe(true)
        expect(cache.has('b')).toBe(false)
    })

    test('같은 키를 덮어쓰면 크기가 늘지 않고 값만 갱신된다', () => {
        const cache = createBoundedLruCache(2)
        cache.set('a', '1')
        cache.set('a', '2')

        expect(cache.size).toBe(1)
        expect(cache.get('a')).toBe('2')
    })

    test('키가 아무리 많이 들어와도 상한을 넘지 않는다', () => {
        const cache = createBoundedLruCache(10)
        for (let index = 0; index < 1000; index++) {
            cache.set(`key-${index}`, String(index))
        }

        expect(cache.size).toBe(10)
        expect(cache.get('key-999')).toBe('999')
        expect(cache.has('key-0')).toBe(false)
    })
})
