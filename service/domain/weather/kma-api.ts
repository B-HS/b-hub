import { redisCache } from '../../shared/redis-cache'

const BASE_URL = 'http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0'
const MAX_RETRIES = 3
const RETRY_DELAY = 1000

const MIN_CACHE_TTL = 30 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const KMA_FETCH_TIMEOUT_MS = 8000
const NEGATIVE_CACHE_TTL_MS = 30 * 1000
const HTTP_CLIENT_ERROR_MIN = 400
const HTTP_CLIENT_ERROR_MAX = 499
const KMA_RESULT_CODE_NO_DATA = '03'

const NCST_BASE_SWITCH_MINUTE = 40
const FCST_BASE_SWITCH_MINUTE = 45
const VILAGE_BASE_SWITCH_MINUTE = 10
const FCST_BASE_MINUTE_OF_HOUR = 30
const VILAGE_BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23]
const FIRST_VILAGE_BASE_HOUR = VILAGE_BASE_HOURS[0]
const LAST_VILAGE_BASE_HOUR = VILAGE_BASE_HOURS[VILAGE_BASE_HOURS.length - 1]

const getNextTtlAtMinute = (switchMinute: number) => {
    const now = new Date()
    const next = new Date(now)
    next.setMinutes(switchMinute, 0, 0)
    if (now.getMinutes() >= switchMinute) next.setHours(next.getHours() + 1)
    return Math.max(next.getTime() - now.getTime(), MIN_CACHE_TTL)
}

const getNextNcstTtl = () => getNextTtlAtMinute(NCST_BASE_SWITCH_MINUTE)

const getNextFcstTtl = () => getNextTtlAtMinute(FCST_BASE_SWITCH_MINUTE)

const getNextVilageTtl = () => {
    const now = new Date()
    const h = now.getHours()
    const m = now.getMinutes()

    for (const bt of VILAGE_BASE_HOURS) {
        if (h < bt || (h === bt && m < VILAGE_BASE_SWITCH_MINUTE)) {
            const next = new Date(now)
            next.setHours(bt, VILAGE_BASE_SWITCH_MINUTE, 0, 0)
            return Math.max(next.getTime() - now.getTime(), MIN_CACHE_TTL)
        }
    }

    const next = new Date(now)
    next.setDate(next.getDate() + 1)
    next.setHours(FIRST_VILAGE_BASE_HOUR, VILAGE_BASE_SWITCH_MINUTE, 0, 0)
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

type KmaAttempt<T> = { settled: true; result: KmaApiResult<T>; noData: boolean } | { settled: false; retryable: boolean; message: string }

type KmaFetchOutcome<T> = { result: KmaApiResult<T>; noData: boolean }

type KmaApiDeps = {
    apiKey: string
    fetchFn?: typeof fetch
}

export const getKmaBaseDateTime = (type: 'ncst' | 'fcst' | 'vilage', nowMs = Date.now()) => {
    const now = new Date(nowMs + KST_OFFSET_MS)
    const minutes = now.getUTCMinutes()

    if (type === 'ncst') {
        if (minutes < NCST_BASE_SWITCH_MINUTE) {
            now.setUTCHours(now.getUTCHours() - 1)
        }
        now.setUTCMinutes(0)
    } else if (type === 'fcst') {
        if (minutes < FCST_BASE_SWITCH_MINUTE) {
            now.setUTCHours(now.getUTCHours() - 1)
        }
        now.setUTCMinutes(FCST_BASE_MINUTE_OF_HOUR)
    } else {
        const currentHour = now.getUTCHours()
        const currentMinutes = now.getUTCMinutes()

        let baseTime = FIRST_VILAGE_BASE_HOUR
        for (const bt of VILAGE_BASE_HOURS) {
            if (currentHour > bt || (currentHour === bt && currentMinutes >= VILAGE_BASE_SWITCH_MINUTE)) {
                baseTime = bt
            }
        }

        if (currentHour < FIRST_VILAGE_BASE_HOUR || (currentHour === FIRST_VILAGE_BASE_HOUR && currentMinutes < VILAGE_BASE_SWITCH_MINUTE)) {
            now.setUTCDate(now.getUTCDate() - 1)
            baseTime = LAST_VILAGE_BASE_HOUR
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
    const inFlight = new Map<string, Promise<KmaApiResult<unknown>>>()

    const fetchOnce = async <T>(url: string): Promise<KmaAttempt<T>> => {
        try {
            const response = await fetchFn(url, { signal: AbortSignal.timeout(KMA_FETCH_TIMEOUT_MS) })
            if (!response.ok) {
                const isClientError = response.status >= HTTP_CLIENT_ERROR_MIN && response.status <= HTTP_CLIENT_ERROR_MAX
                return { settled: false, retryable: !isClientError, message: `HTTP ${response.status}` }
            }

            const data = (await response.json()) as KMAResponse<T>
            const header = data.response?.header

            if (!header) return { settled: false, retryable: true, message: 'Invalid response structure' }

            if (header.resultCode !== '00') {
                return {
                    settled: true,
                    result: { success: false, error: { code: mapKmaErrorCode(header.resultCode), message: header.resultMsg } },
                    noData: header.resultCode === KMA_RESULT_CODE_NO_DATA,
                }
            }

            return { settled: true, result: { success: true, data: data.response.body.items.item as T }, noData: false }
        } catch (error) {
            return { settled: false, retryable: true, message: error instanceof Error ? error.message : 'External API request failed' }
        }
    }

    const fetchWithRetry = async <T>(url: string): Promise<KmaFetchOutcome<T>> => {
        let lastMessage = 'Weather service temporarily unavailable'

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const attemptResult = await fetchOnce<T>(url)
            if (attemptResult.settled) return { result: attemptResult.result, noData: attemptResult.noData }

            lastMessage = attemptResult.message
            if (!attemptResult.retryable) break
            if (attempt < MAX_RETRIES) await delay(RETRY_DELAY * attempt)
        }

        return { result: { success: false, error: { code: 'WEATHER_KMA_API_ERROR', message: lastMessage } }, noData: false }
    }

    const cachedFetch = async <T>(cacheKey: string, ttlMs: number, fetcher: () => Promise<KmaFetchOutcome<T>>): Promise<KmaApiResult<T>> => {
        const cached = await redisCache.get<KmaApiResult<T>>(cacheKey)
        if (cached) return cached

        const pending = inFlight.get(cacheKey)
        if (pending) return (await pending) as KmaApiResult<T>

        const task = (async () => {
            const { result, noData } = await fetcher()
            if (result.success) {
                await redisCache.set(cacheKey, result, Math.max(Math.ceil(ttlMs / 1000), 1))
                return result
            }
            if (noData) await redisCache.set(cacheKey, result, Math.max(Math.ceil(NEGATIVE_CACHE_TTL_MS / 1000), 1))
            return result
        })()

        inFlight.set(cacheKey, task as Promise<KmaApiResult<unknown>>)
        try {
            return await task
        } finally {
            inFlight.delete(cacheKey)
        }
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
            const { result, noData } = await fetchWithRetry<KMAVersionItem[]>(`${BASE_URL}/getFcstVersion?${params}`)
            if (result.success && Array.isArray(result.data) && result.data.length > 0) {
                return { result: { success: true as const, data: result.data[0] }, noData }
            }
            return { result: result as KmaApiResult<KMAVersionItem>, noData }
        })
    }

    return { getUltraSrtNcst, getUltraSrtFcst, getVilageFcst, getFcstVersion }
}

export type KmaApiService = ReturnType<typeof createKmaApiService>
