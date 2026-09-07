type CacheEntry<T> = {
    value: T
    expiresAt: number
}

type CacheConfig = {
    maxSize?: number
    defaultTtlMs?: number
}

export const createCache = <T>(config: CacheConfig = {}) => {
    const { maxSize = 1000, defaultTtlMs = 5 * 60 * 1000 } = config
    const store = new Map<string, CacheEntry<T>>()

    const evict = () => {
        while (store.size >= maxSize) {
            const oldest = store.keys().next().value
            if (oldest === undefined) return
            store.delete(oldest)
        }
    }

    const get = (key: string): T | null => {
        const entry = store.get(key)
        if (!entry) return null
        store.delete(key)
        if (entry.expiresAt <= Date.now()) return null
        store.set(key, entry)
        return entry.value
    }

    const set = (key: string, value: T, ttlMs?: number) => {
        if (store.has(key)) store.delete(key)
        else evict()
        store.set(key, { value, expiresAt: Date.now() + (ttlMs ?? defaultTtlMs) })
    }

    const del = (key: string) => {
        store.delete(key)
    }

    const clear = () => {
        store.clear()
    }

    const size = () => store.size

    const has = (key: string) => {
        const entry = store.get(key)
        if (!entry) return false
        if (entry.expiresAt <= Date.now()) {
            store.delete(key)
            return false
        }
        return true
    }

    return { get, set, del, clear, size, has }
}
