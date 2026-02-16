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
    const accessOrder: string[] = []

    const evict = () => {
        while (store.size >= maxSize && accessOrder.length > 0) {
            const oldest = accessOrder.shift()!
            store.delete(oldest)
        }
    }

    const get = (key: string): T | null => {
        const entry = store.get(key)
        if (!entry) return null
        if (entry.expiresAt <= Date.now()) {
            store.delete(key)
            return null
        }
        const idx = accessOrder.indexOf(key)
        if (idx > -1) accessOrder.splice(idx, 1)
        accessOrder.push(key)
        return entry.value
    }

    const set = (key: string, value: T, ttlMs?: number) => {
        if (store.has(key)) {
            const idx = accessOrder.indexOf(key)
            if (idx > -1) accessOrder.splice(idx, 1)
        } else {
            evict()
        }
        store.set(key, { value, expiresAt: Date.now() + (ttlMs ?? defaultTtlMs) })
        accessOrder.push(key)
    }

    const del = (key: string) => {
        store.delete(key)
        const idx = accessOrder.indexOf(key)
        if (idx > -1) accessOrder.splice(idx, 1)
    }

    const clear = () => {
        store.clear()
        accessOrder.length = 0
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
