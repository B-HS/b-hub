import { describe, expect, test } from 'bun:test'
import { createMockKmaApiService } from '../../../../service/domain/weather/mock-kma-api'
import { parseCurrentWeather, parseUltraForecasts, parseShortForecasts } from '../../../../service/domain/weather/weather-data'

describe('createMockKmaApiService', () => {
    const mockApi = createMockKmaApiService()

    describe('getUltraSrtNcst', () => {
        test('올바른 KMAWeatherItem 구조를 반환한다', async () => {
            const result = await mockApi.getUltraSrtNcst(60, 127)
            expect(result.success).toBe(true)
            if (!result.success) return

            for (const item of result.data) {
                expect(item.baseDate).toMatch(/^\d{8}$/)
                expect(item.baseTime).toMatch(/^\d{4}$/)
                expect(item.nx).toBe(60)
                expect(item.ny).toBe(127)
                expect(item.obsrValue).toBeDefined()
            }
        })

        test('필수 카테고리를 모두 포함한다', async () => {
            const result = await mockApi.getUltraSrtNcst(60, 127)
            if (!result.success) return

            const categories = result.data.map((item) => item.category)
            for (const cat of ['T1H', 'REH', 'RN1', 'VEC', 'WSD', 'UUU', 'VVV', 'PTY']) {
                expect(categories).toContain(cat)
            }
        })

        test('parseCurrentWeather로 파싱할 수 있다', async () => {
            const result = await mockApi.getUltraSrtNcst(60, 127)
            if (!result.success) return

            const parsed = parseCurrentWeather(result.data)
            expect(typeof parsed.temperature).toBe('number')
            expect(typeof parsed.humidity).toBe('number')
            expect(typeof parsed.windSpeed).toBe('number')
            expect(typeof parsed.ptyText).toBe('string')
        })

        test('매 호출마다 다른 값을 반환한다', async () => {
            const r1 = await mockApi.getUltraSrtNcst(60, 127)
            const r2 = await mockApi.getUltraSrtNcst(60, 127)
            if (!r1.success || !r2.success) return

            const vals1 = r1.data.map((i) => i.obsrValue).join(',')
            const vals2 = r2.data.map((i) => i.obsrValue).join(',')
            expect(vals1).not.toBe(vals2)
        })
    })

    describe('getUltraSrtFcst', () => {
        test('6시간치 예보 아이템을 반환한다', async () => {
            const result = await mockApi.getUltraSrtFcst(60, 127)
            expect(result.success).toBe(true)
            if (!result.success) return

            expect(result.data.length).toBe(60)
        })

        test('parseUltraForecasts로 파싱할 수 있다', async () => {
            const result = await mockApi.getUltraSrtFcst(60, 127)
            if (!result.success) return

            const forecasts = parseUltraForecasts(result.data)
            expect(forecasts.length).toBe(6)
            for (const f of forecasts) {
                expect(typeof f.temperature).toBe('number')
                expect(typeof f.skyText).toBe('string')
            }
        })
    })

    describe('getVilageFcst', () => {
        test('3일치 단기예보 아이템을 반환한다', async () => {
            const result = await mockApi.getVilageFcst(60, 127)
            expect(result.success).toBe(true)
            if (!result.success) return

            expect(result.data.length).toBeGreaterThan(0)
        })

        test('parseShortForecasts로 파싱할 수 있다', async () => {
            const result = await mockApi.getVilageFcst(60, 127)
            if (!result.success) return

            const forecasts = parseShortForecasts(result.data)
            expect(forecasts.length).toBeGreaterThan(0)
            for (const f of forecasts) {
                expect(f.fcstDate).toMatch(/^\d{8}$/)
                expect(typeof f.skyText).toBe('string')
            }
        })
    })

    describe('getFcstVersion', () => {
        test('올바른 버전 정보를 반환한다', async () => {
            const result = await mockApi.getFcstVersion('ODAM')
            expect(result.success).toBe(true)
            if (!result.success) return

            expect(result.data.filetype).toBe('ODAM')
            expect(result.data.version).toMatch(/^\d{14,16}$/)
        })
    })
})
