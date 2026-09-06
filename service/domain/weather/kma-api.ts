import { redisCache } from '../../shared/redis-cache'

const BASE_URL = 'http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0'
const MAX_RETRIES = 3
const RETRY_DELAY = 1000

const MIN_CACHE_TTL = 30 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

const getNextNcstTtl = () => {
    const now = new Date()
    const next = new Date(now)
    next.setMinutes(10, 0, 0)
    if (now.getMinutes() >= 10) next.setHours(next.getHours() + 1)
    return Math.max(next.getTime() - now.getTime(), MIN_CACHE_TTL)
}

const getNextFcstTtl = () => {
    const now = new Date()
    const next = new Date(now)
    next.setMinutes(45, 0, 0)
    if (now.getMinutes() >= 45) next.setHours(next.getHours() + 1)
    return Math.max(next.getTime() - now.getTime(), MIN_CACHE_TTL)
}

const VILAGE_BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23]

const getNextVilageTtl = () => {
    const now = new Date()
    const h = now.getHours()
    const m = now.getMinutes()

    for (const bt of VILAGE_BASE_HOURS) {
        const provideMin = 10
        if (h < bt || (h === bt && m < provideMin)) {
            const next = new Date(now)
            next.setHours(bt, provideMin, 0, 0)
            return Math.max(next.getTime() - now.getTime(), MIN_CACHE_TTL)
        }
    }

    const next = new Date(now)
    next.setDate(next.getDate() + 1)
    next.setHours(2, 10, 0, 0)
    return Math.max(next.getTime() - now.getTime(), MIN_CACHE_TTL)
}

type KMAResponseHeader = {
    resultCode: string
    resultMsg: string
}

type KMAResponse<T> = {
    response: {
        header: KMAResponseHeader
        body: {
            items: { item: T[] }
        }
    }
}

export type KMAWeatherItem = {
    baseDate: string
    baseTime: string
    category: string
    fcstDate?: string
    fcstTime?: string
    nx: number
    ny: number
    obsrValue?: string
    fcstValue?: string
}

export type KMAVersionItem = {
    filetype: string
    version: string
}

type KmaApiResult<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } }

type KmaApiDeps = {
    apiKey: string
    fetchFn?: typeof fetch
}

export const getKmaBaseDateTime = (type: 'ncst' | 'fcst' | 'vilage', nowMs = Date.now()) => {
    const now = new Date(nowMs + KST_OFFSET_MS)
    const minutes = now.getUTCMinutes()

    if (type === 'ncst') {
        if (minutes < 40) {
            now.setUTCHours(now.getUTCHours() - 1)
        }
        now.setUTCMinutes(0)
    } else if (type === 'fcst') {
        if (minutes < 45) {
            now.setUTCHours(now.getUTCHours() - 1)
        }
        now.setUTCMinutes(30)
    } else {
        const baseTimes = [2, 5, 8, 11, 14, 17, 20, 23]
        const currentHour = now.getUTCHours()
        const currentMinutes = now.getUTCMinutes()

        let baseTime = baseTimes[0]
        for (const bt of baseTimes) {
            if (currentHour > bt || (currentHour === bt && currentMinutes >= 10)) {
                baseTime = bt
            }
        }

        if (currentHour < 2 || (currentHour === 2 && currentMinutes < 10)) {
            now.setUTCDate(now.getUTCDate() - 1)
            baseTime = 23
        }

        now.setUTCHours(baseTime)
        now.setUTCMinutes(0)
    }

    const y = now.getUTCFullYear()
    const mo = String(now.getUTCMonth() + 1).padStart(2, '0')
    const d = String(now.getUTCDate()).padStart(2, '0')
    const hh = String(now.getUTCHours()).padStart(2, '0')
    const mm = String(now.getUTCMinutes()).padStart(2, '0')
    return {
        baseDate: `${y}${mo}${d}`,
        baseTime: `${hh}${mm}`,
    }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const mapKmaErrorCode = (kmaCode: string) => {
    const errorMap: Record<string, string> = {
        '01': 'WEATHER_KMA_API_ERROR',
        '02': 'WEATHER_KMA_API_ERROR',
        '03': 'WEATHER_DATA_NOT_FOUND',
        '04': 'WEATHER_KMA_API_ERROR',
        '05': 'WEATHER_KMA_API_ERROR',
        '10': 'WEATHER_KMA_API_ERROR',
        '11': 'WEATHER_KMA_API_ERROR',
        '12': 'WEATHER_KMA_API_ERROR',
        '20': 'WEATHER_KMA_API_ERROR',
        '21': 'WEATHER_KMA_API_ERROR',
        '22': 'WEATHER_KMA_API_ERROR',
        '30': 'WEATHER_KMA_API_ERROR',
        '31': 'WEATHER_KMA_API_ERROR',
        '32': 'WEATHER_KMA_API_ERROR',
        '99': 'WEATHER_KMA_API_ERROR',
    }
    return errorMap[kmaCode] || 'WEATHER_KMA_API_ERROR'
}

export const createKmaApiService = (deps: KmaApiDeps) => {
    const fetchFn = deps.fetchFn ?? fetch
    const fetchWithRetry = async <T>(url: string): Promise<KmaApiResult<T>> => {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await fetchFn(url)
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`)
                }

                const data = (await response.json()) as KMAResponse<T>
                const header = data.response?.header

                if (!header) {
                    throw new Error('Invalid response structure')
                }

                if (header.resultCode !== '00') {
                    return {
                        success: false,
                        error: {
                            code: mapKmaErrorCode(header.resultCode),
                            message: header.resultMsg,
                        },
                    }
                }

                return {
                    success: true,
                    data: data.response.body.items.item as T,
                }
            } catch (error) {
                if (attempt < MAX_RETRIES) {
                    await delay(RETRY_DELAY * attempt)
                    continue
                }

                return {
                    success: false,
                    error: {
                        code: 'WEATHER_KMA_API_ERROR',
                        message: error instanceof Error ? error.message : 'External API request failed',
                    },
                }
            }
        }

        return {
            success: false,
            error: {
                code: 'WEATHER_KMA_API_ERROR',
                message: 'Weather service temporarily unavailable',
            },
        }
    }

    const cachedFetch = async <T>(cacheKey: string, ttlMs: number, fetcher: () => Promise<KmaApiResult<T>>): Promise<KmaApiResult<T>> => {
        const cached = await redisCache.get<KmaApiResult<T>>(cacheKey)
        if (cached) return cached

        const result = await fetcher()
        if (result.success) {
            const ttlSeconds = Math.max(Math.ceil(ttlMs / 1000), 1)
            await redisCache.set(cacheKey, result, ttlSeconds)
        }
        return result
    }

    const getUltraSrtNcst = async (nx: number, ny: number) => {
        const { baseDate, baseTime } = getKmaBaseDateTime('ncst')
        const cacheKey = `ncst:${baseDate}:${baseTime}:${nx}:${ny}`

        return cachedFetch<KMAWeatherItem[]>(cacheKey, getNextNcstTtl(), () => {
            const params = new URLSearchParams({
                serviceKey: deps.apiKey,
                numOfRows: '10',
                pageNo: '1',
                dataType: 'JSON',
                base_date: baseDate,
                base_time: baseTime,
                nx: String(nx),
                ny: String(ny),
            })
            return fetchWithRetry<KMAWeatherItem[]>(`${BASE_URL}/getUltraSrtNcst?${params}`)
        })
    }

    const getUltraSrtFcst = async (nx: number, ny: number) => {
        const { baseDate, baseTime } = getKmaBaseDateTime('fcst')
        const cacheKey = `fcst:${baseDate}:${baseTime}:${nx}:${ny}`

        return cachedFetch<KMAWeatherItem[]>(cacheKey, getNextFcstTtl(), () => {
            const params = new URLSearchParams({
                serviceKey: deps.apiKey,
                numOfRows: '60',
                pageNo: '1',
                dataType: 'JSON',
                base_date: baseDate,
                base_time: baseTime,
                nx: String(nx),
                ny: String(ny),
            })
            return fetchWithRetry<KMAWeatherItem[]>(`${BASE_URL}/getUltraSrtFcst?${params}`)
        })
    }

    const getVilageFcst = async (nx: number, ny: number) => {
        const { baseDate, baseTime } = getKmaBaseDateTime('vilage')
        const cacheKey = `vilage:${baseDate}:${baseTime}:${nx}:${ny}`

        return cachedFetch<KMAWeatherItem[]>(cacheKey, getNextVilageTtl(), () => {
            const params = new URLSearchParams({
                serviceKey: deps.apiKey,
                numOfRows: '1000',
                pageNo: '1',
                dataType: 'JSON',
                base_date: baseDate,
                base_time: baseTime,
                nx: String(nx),
                ny: String(ny),
            })
            return fetchWithRetry<KMAWeatherItem[]>(`${BASE_URL}/getVilageFcst?${params}`)
        })
    }

    const getFcstVersion = async (ftype: string) => {
        const { baseDate, baseTime } = getKmaBaseDateTime('vilage')
        const cacheKey = `version:${ftype}:${baseDate}:${baseTime}`

        return cachedFetch<KMAVersionItem>(cacheKey, getNextVilageTtl(), async () => {
            const params = new URLSearchParams({
                serviceKey: deps.apiKey,
                numOfRows: '1',
                pageNo: '1',
                dataType: 'JSON',
                ftype,
                basedatetime: `${baseDate}${baseTime}`,
            })
            const result = await fetchWithRetry<KMAVersionItem[]>(`${BASE_URL}/getFcstVersion?${params}`)
            if (result.success && Array.isArray(result.data) && result.data.length > 0) {
                return { success: true as const, data: result.data[0] }
            }
            return result as KmaApiResult<KMAVersionItem>
        })
    }

    return { getUltraSrtNcst, getUltraSrtFcst, getVilageFcst, getFcstVersion }
}

export type KmaApiService = ReturnType<typeof createKmaApiService>
