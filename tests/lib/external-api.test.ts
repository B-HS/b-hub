import { describe, expect, test, mock } from 'bun:test'
import { fetchWithRetry, fetchBatch } from '../../lib/external-api'

describe('fetchWithRetry', () => {
    test('성공 응답을 반환한다', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({ data: 'ok' }), { status: 200 }))) as typeof fetch

        const result = await fetchWithRetry<{ data: string }>('https://example.com/api')
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data).toEqual({ data: 'ok' })
        }

        globalThis.fetch = originalFetch
    })

    test('실패 시 재시도한다', async () => {
        const originalFetch = globalThis.fetch
        let attempt = 0
        globalThis.fetch = mock(() => {
            attempt++
            if (attempt < 3) {
                return Promise.reject(new Error('network error'))
            }
            return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
        }) as typeof fetch

        const result = await fetchWithRetry('https://example.com', {
            maxRetries: 3,
            retryDelay: 10,
        })
        expect(result.success).toBe(true)

        globalThis.fetch = originalFetch
    })

    test('최대 재시도 후 실패를 반환한다', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = mock(() => Promise.reject(new Error('fail'))) as typeof fetch

        const result = await fetchWithRetry('https://example.com', {
            maxRetries: 2,
            retryDelay: 10,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.error).toBe('fail')
        }

        globalThis.fetch = originalFetch
    })

    test('HTTP 에러 상태를 처리한다', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = mock(() => Promise.resolve(new Response('', { status: 500, statusText: 'Internal Server Error' }))) as typeof fetch

        const result = await fetchWithRetry('https://example.com', {
            maxRetries: 1,
            retryDelay: 10,
        })
        expect(result.success).toBe(false)

        globalThis.fetch = originalFetch
    })
})

describe('fetchBatch', () => {
    test('배치로 데이터를 가져온다', async () => {
        const fetcher = mock((id: string | number) => Promise.resolve({ id }))
        const results = await fetchBatch([1, 2, 3], fetcher, 2, 10)
        expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
        expect(fetcher).toHaveBeenCalledTimes(3)
    })

    test('null 결과를 포함한다', async () => {
        const fetcher = mock((id: string | number) => (id === 2 ? Promise.resolve(null) : Promise.resolve({ id })))
        const results = await fetchBatch([1, 2, 3], fetcher, 10, 10)
        expect(results).toEqual([{ id: 1 }, null, { id: 3 }])
    })

    test('빈 배열을 처리한다', async () => {
        const fetcher = mock(() => Promise.resolve(null))
        const results = await fetchBatch([], fetcher)
        expect(results).toEqual([])
        expect(fetcher).not.toHaveBeenCalled()
    })
})
