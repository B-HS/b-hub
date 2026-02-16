import { describe, expect, test, mock } from 'bun:test'
import { batchInsert, chunkArray } from '../../lib/db-helper'

describe('batchInsert', () => {
    test('배치 크기에 맞게 분할하여 insert한다', async () => {
        const items = [1, 2, 3, 4, 5]
        const inserter = mock(() => Promise.resolve())
        await batchInsert(items, inserter, 2)
        expect(inserter).toHaveBeenCalledTimes(3)
        expect(inserter.mock.calls[0][0]).toEqual([1, 2])
        expect(inserter.mock.calls[1][0]).toEqual([3, 4])
        expect(inserter.mock.calls[2][0]).toEqual([5])
    })

    test('빈 배열은 insert를 호출하지 않는다', async () => {
        const inserter = mock(() => Promise.resolve())
        await batchInsert([], inserter, 10)
        expect(inserter).not.toHaveBeenCalled()
    })

    test('아이템 수가 배치 크기보다 작으면 한 번만 호출된다', async () => {
        const inserter = mock(() => Promise.resolve())
        await batchInsert([1, 2], inserter, 10)
        expect(inserter).toHaveBeenCalledTimes(1)
    })
})

describe('chunkArray', () => {
    test('배열을 지정 크기로 분할한다', () => {
        const result = chunkArray([1, 2, 3, 4, 5], 2)
        expect(result).toEqual([[1, 2], [3, 4], [5]])
    })

    test('빈 배열은 빈 배열을 반환한다', () => {
        expect(chunkArray([], 5)).toEqual([])
    })

    test('크기가 배열 길이보다 크면 단일 청크를 반환한다', () => {
        expect(chunkArray([1, 2], 10)).toEqual([[1, 2]])
    })

    test('크기가 1이면 각 요소가 개별 청크가 된다', () => {
        expect(chunkArray([1, 2, 3], 1)).toEqual([[1], [2], [3]])
    })
})
