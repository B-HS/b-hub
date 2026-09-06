import { describe, expect, test, mock } from 'bun:test'

const cacheSetCalls: { key: string; ttlSeconds: number }[] = []

mock.module('../../../../service/shared/redis-cache', () => ({
    redisCache: {
        get: async () => null,
        set: async (key: string, _value: unknown, ttlSeconds: number) => {
            cacheSetCalls.push({ key, ttlSeconds })
        },
    },
}))

const { createKmaApiService, getKmaBaseDateTime } = await import('../../../../service/domain/weather/kma-api')

const createMockKmaResponse = (items: Record<string, string | number>[]) => ({
    response: {
        header: { resultCode: '00', resultMsg: 'NORMAL_SERVICE' },
        body: {
            items: { item: items },
            pageNo: 1,
            numOfRows: 10,
            totalCount: items.length,
        },
    },
})

const createMockFetch = (responseData: Record<string, unknown>) =>
    mock(() =>
        Promise.resolve({
            ok: true,
            json: () => Promise.resolve(responseData),
        } as Response),
    )

describe('createKmaApiService', () => {
    test('getUltraSrtNcst 성공', async () => {
        const items = [
            {
                baseDate: '20250101',
                baseTime: '1200',
                category: 'T1H',
                obsrValue: '5',
                nx: 60,
                ny: 127,
            },
        ]
        const fetchFn = createMockFetch(createMockKmaResponse(items))
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        const result = await service.getUltraSrtNcst(60, 127)
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data).toHaveLength(1)
        }
    })

    test('getUltraSrtFcst 성공', async () => {
        const items = [
            {
                baseDate: '20250101',
                baseTime: '1200',
                category: 'T1H',
                fcstDate: '20250101',
                fcstTime: '1300',
                fcstValue: '6',
                nx: 60,
                ny: 127,
            },
        ]
        const fetchFn = createMockFetch(createMockKmaResponse(items))
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        const result = await service.getUltraSrtFcst(60, 127)
        expect(result.success).toBe(true)
    })

    test('getVilageFcst 성공', async () => {
        const items = [
            {
                baseDate: '20250101',
                baseTime: '0500',
                category: 'TMP',
                fcstDate: '20250101',
                fcstTime: '0600',
                fcstValue: '3',
                nx: 60,
                ny: 127,
            },
        ]
        const fetchFn = createMockFetch(createMockKmaResponse(items))
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        const result = await service.getVilageFcst(60, 127)
        expect(result.success).toBe(true)
    })

    test('getFcstVersion 성공', async () => {
        const items = [{ filetype: 'ODAM', version: '20250101120000' }]
        const fetchFn = createMockFetch(createMockKmaResponse(items))
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        const result = await service.getFcstVersion('ODAM')
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.filetype).toBe('ODAM')
        }
    })

    test('KMA 에러 응답을 처리한다', async () => {
        const fetchFn = mock(() =>
            Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve({
                        response: {
                            header: { resultCode: '03', resultMsg: 'NO_DATA' },
                            body: { items: { item: [] } },
                        },
                    }),
            } as Response),
        )
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        const result = await service.getUltraSrtNcst(60, 127)
        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.error.code).toBe('WEATHER_DATA_NOT_FOUND')
        }
    })

    test('네트워크 에러 시 재시도 후 실패한다', async () => {
        const fetchFn = mock(() => Promise.reject(new Error('Network error')))
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        const result = await service.getUltraSrtNcst(60, 127)
        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.error.code).toBe('WEATHER_KMA_API_ERROR')
        }
    })

    test('HTTP 에러 시 재시도 후 실패한다', async () => {
        const fetchFn = mock(() =>
            Promise.resolve({
                ok: false,
                status: 500,
            } as Response),
        )
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        const result = await service.getUltraSrtNcst(60, 127)
        expect(result.success).toBe(false)
    })

    test('잘못된 응답 구조를 처리한다', async () => {
        const fetchFn = mock(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ invalid: true }),
            } as Response),
        )
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        const result = await service.getUltraSrtNcst(60, 127)
        expect(result.success).toBe(false)
    })

    test('getFcstVersion 빈 배열이면 원본 결과를 그대로 반환한다', async () => {
        const fetchFn = createMockFetch(createMockKmaResponse([]))
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        const result = await service.getFcstVersion('ODAM')
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data).toEqual([])
        }
    })

    test('fetch가 timeout되면 재시도 후 에러를 반환한다', async () => {
        const fetchFn = mock(() => Promise.reject(new Error('Timeout')))
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        const result = await service.getUltraSrtFcst(60, 127)
        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.error.code).toBe('WEATHER_KMA_API_ERROR')
        }
    })

    test('getVilageFcst도 네트워크 에러를 처리한다', async () => {
        const fetchFn = mock(() => Promise.reject(new Error('DNS failure')))
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        const result = await service.getVilageFcst(60, 127)
        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.error.code).toBe('WEATHER_KMA_API_ERROR')
        }
    })

    test('URL에 apiKey가 포함된다', async () => {
        const fetchFn = createMockFetch(createMockKmaResponse([]))
        const service = createKmaApiService({ apiKey: 'my-secret-key', fetchFn })

        await service.getUltraSrtNcst(60, 127)
        const url = (fetchFn as ReturnType<typeof mock>).mock.calls[0][0] as string
        expect(url).toContain('serviceKey=my-secret-key')
    })

    test('getUltraSrtNcst에서 base_date는 YYYYMMDD 형식이다', async () => {
        const fetchFn = createMockFetch(createMockKmaResponse([]))
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        await service.getUltraSrtNcst(60, 127)
        const url = (fetchFn as ReturnType<typeof mock>).mock.calls[0][0] as string
        const params = new URLSearchParams(url.split('?')[1])
        const baseDate = params.get('base_date')!
        expect(baseDate).toMatch(/^\d{8}$/)
    })

    test('getUltraSrtNcst에서 base_time은 HHMM 형식이다', async () => {
        const fetchFn = createMockFetch(createMockKmaResponse([]))
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        await service.getUltraSrtNcst(60, 127)
        const url = (fetchFn as ReturnType<typeof mock>).mock.calls[0][0] as string
        const params = new URLSearchParams(url.split('?')[1])
        const baseTime = params.get('base_time')!
        expect(baseTime).toMatch(/^\d{4}$/)
    })

    test('getVilageFcst에서 base_time은 유효한 발표 시간이다', async () => {
        const fetchFn = createMockFetch(createMockKmaResponse([]))
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        await service.getVilageFcst(60, 127)
        const url = (fetchFn as ReturnType<typeof mock>).mock.calls[0][0] as string
        const params = new URLSearchParams(url.split('?')[1])
        const baseTime = params.get('base_time')!
        const validBaseTimes = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300']
        expect(validBaseTimes).toContain(baseTime)
    })

    test('getUltraSrtFcst에서 base_time의 분은 30이다', async () => {
        const fetchFn = createMockFetch(createMockKmaResponse([]))
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        await service.getUltraSrtFcst(60, 127)
        const url = (fetchFn as ReturnType<typeof mock>).mock.calls[0][0] as string
        const params = new URLSearchParams(url.split('?')[1])
        const baseTime = params.get('base_time')!
        expect(baseTime.slice(2)).toBe('30')
    })
})

describe('createKmaApiService 상류 보호', () => {
    test('fetch 에 AbortSignal 을 전달한다', async () => {
        const fetchFn = createMockFetch(createMockKmaResponse([]))
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        await service.getUltraSrtNcst(60, 127)
        const init = (fetchFn as ReturnType<typeof mock>).mock.calls[0][1] as RequestInit
        expect(init.signal).toBeInstanceOf(AbortSignal)
    })

    test('4xx 응답은 재시도 없이 즉시 실패한다', async () => {
        const fetchFn = mock(() => Promise.resolve({ ok: false, status: 404 } as Response))
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        const result = await service.getUltraSrtNcst(61, 128)
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error.code).toBe('WEATHER_KMA_API_ERROR')
        expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    test('5xx 응답은 3회까지 재시도한다', async () => {
        const fetchFn = mock(() => Promise.resolve({ ok: false, status: 503 } as Response))
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        const result = await service.getUltraSrtNcst(62, 129)
        expect(result.success).toBe(false)
        expect(fetchFn).toHaveBeenCalledTimes(3)
    })

    test('resultCode 03 은 30초 negative cache 로 저장한다', async () => {
        cacheSetCalls.length = 0
        const fetchFn = mock(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ response: { header: { resultCode: '03', resultMsg: 'NO_DATA' }, body: { items: { item: [] } } } }),
            } as Response),
        )
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        const result = await service.getUltraSrtNcst(63, 130)
        expect(result.success).toBe(false)
        expect(cacheSetCalls).toHaveLength(1)
        expect(cacheSetCalls[0].ttlSeconds).toBe(30)
        expect(cacheSetCalls[0].key).toContain(':63:130')
    })

    test('resultCode 03 이 아닌 실패는 캐시하지 않는다', async () => {
        cacheSetCalls.length = 0
        const fetchFn = mock(() =>
            Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve({ response: { header: { resultCode: '10', resultMsg: 'INVALID_REQUEST' }, body: { items: { item: [] } } } }),
            } as Response),
        )
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        await service.getUltraSrtNcst(64, 131)
        expect(cacheSetCalls).toHaveLength(0)
    })

    test('같은 키 동시 요청은 상류를 한 번만 호출한다', async () => {
        const fetchFn = mock(
            () =>
                new Promise<Response>((resolve) =>
                    setTimeout(() => resolve({ ok: true, json: () => Promise.resolve(createMockKmaResponse([])) } as Response), 10),
                ),
        )
        const service = createKmaApiService({ apiKey: 'test-key', fetchFn })

        const [a, b] = await Promise.all([service.getUltraSrtNcst(65, 132), service.getUltraSrtNcst(65, 132)])
        expect(a.success).toBe(true)
        expect(b.success).toBe(true)
        expect(fetchFn).toHaveBeenCalledTimes(1)
    })
})

const KST_MIDNIGHT_45 = Date.parse('2025-01-01T15:45:00Z')
const KST_MIDNIGHT_30 = Date.parse('2025-01-01T15:30:00Z')

const withTimezone = <T>(timezone: string, run: () => T) => {
    const originalTimezone = process.env.TZ
    process.env.TZ = timezone
    try {
        return run()
    } finally {
        if (originalTimezone === undefined) delete process.env.TZ
        else process.env.TZ = originalTimezone
    }
}

describe('getKmaBaseDateTime', () => {
    test('ncst는 KST 기준 정시로 내림한다', () => {
        expect(getKmaBaseDateTime('ncst', KST_MIDNIGHT_45)).toEqual({ baseDate: '20250102', baseTime: '0000' })
    })

    test('ncst는 40분 이전이면 직전 시각으로 내려 날짜도 함께 넘어간다', () => {
        expect(getKmaBaseDateTime('ncst', KST_MIDNIGHT_30)).toEqual({ baseDate: '20250101', baseTime: '2300' })
    })

    test('fcst는 30분 base time을 만든다', () => {
        expect(getKmaBaseDateTime('fcst', KST_MIDNIGHT_45)).toEqual({ baseDate: '20250102', baseTime: '0030' })
    })

    test('vilage는 KST 02시 10분 이전이면 전날 2300을 쓴다', () => {
        expect(getKmaBaseDateTime('vilage', KST_MIDNIGHT_45)).toEqual({ baseDate: '20250101', baseTime: '2300' })
    })

    test('baseDate는 YYYYMMDD, ncst baseTime은 HH00 형식이다', () => {
        const { baseDate, baseTime } = getKmaBaseDateTime('ncst', KST_MIDNIGHT_45)
        expect(baseDate).toMatch(/^\d{8}$/)
        expect(baseTime).toMatch(/^\d{2}00$/)
    })

    test('프로세스 TZ와 무관하게 동일한 KST 값을 만든다', () => {
        const onUtc = withTimezone('UTC', () => getKmaBaseDateTime('ncst', KST_MIDNIGHT_45))
        const onSeoul = withTimezone('Asia/Seoul', () => getKmaBaseDateTime('ncst', KST_MIDNIGHT_45))
        const onNewYork = withTimezone('America/New_York', () => getKmaBaseDateTime('ncst', KST_MIDNIGHT_45))
        expect(onUtc).toEqual({ baseDate: '20250102', baseTime: '0000' })
        expect(onSeoul).toEqual(onUtc)
        expect(onNewYork).toEqual(onUtc)
    })
})
