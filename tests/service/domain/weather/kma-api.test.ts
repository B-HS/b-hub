import { describe, expect, test, mock } from 'bun:test'

mock.module('../../../../service/shared/redis-cache', () => ({
    redisCache: {
        get: async () => null,
        set: async () => {},
    },
}))

const { createKmaApiService } = await import('../../../../service/domain/weather/kma-api')

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
