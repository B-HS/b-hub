const DEFAULT_MAX_RETRIES = 3
const DEFAULT_RETRY_DELAY = 1000
const DEFAULT_TIMEOUT = 10000

type FetchWithRetryOptions = {
    maxRetries?: number
    retryDelay?: number
    timeout?: number
    headers?: Record<string, string>
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const fetchWithRetry = async <T>(url: string, options: FetchWithRetryOptions = {}) => {
    const { maxRetries = DEFAULT_MAX_RETRIES, retryDelay = DEFAULT_RETRY_DELAY, timeout = DEFAULT_TIMEOUT, headers } = options

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), timeout)

            const response = await fetch(url, {
                signal: controller.signal,
                headers,
            })
            clearTimeout(timeoutId)

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const data = (await response.json()) as T
            return { success: true as const, data }
        } catch (error) {
            if (attempt < maxRetries) {
                await delay(retryDelay * attempt)
                continue
            }
            return {
                success: false as const,
                error: error instanceof Error ? error.message : 'Request failed',
            }
        }
    }

    return { success: false as const, error: 'Max retries exceeded' }
}

export const fetchBatch = async <T>(
    ids: readonly (string | number)[],
    fetcher: (id: string | number) => Promise<T | null>,
    batchSize = 10,
    batchDelay = 100,
) => {
    const results: (T | null)[] = []

    for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize)
        const batchResults = await Promise.all(batch.map(fetcher))
        results.push(...batchResults)

        if (i + batchSize < ids.length) {
            await delay(batchDelay)
        }
    }

    return results
}
