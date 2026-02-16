import { describe, expect, test } from 'bun:test'
import {
    getSkyText,
    getPtyText,
    getPtyTextShort,
    getRainfallText,
    getSnowfallText,
    getWindDirectionText,
    parseCurrentWeather,
    parseUltraForecasts,
    parseShortForecasts,
} from '../../../../service/domain/weather/weather-data'

describe('weather code helpers', () => {
    test('getSkyText', () => {
        expect(getSkyText(1)).toBe('맑음')
        expect(getSkyText(3)).toBe('구름많음')
        expect(getSkyText(4)).toBe('흐림')
        expect(getSkyText(99)).toBe('알수없음')
    })

    test('getPtyText', () => {
        expect(getPtyText(0)).toBe('없음')
        expect(getPtyText(1)).toBe('비')
        expect(getPtyText(3)).toBe('눈')
        expect(getPtyText(5)).toBe('빗방울')
        expect(getPtyText(99)).toBe('알수없음')
    })

    test('getPtyTextShort', () => {
        expect(getPtyTextShort(0)).toBe('없음')
        expect(getPtyTextShort(4)).toBe('소나기')
        expect(getPtyTextShort(99)).toBe('알수없음')
    })

    test('getRainfallText', () => {
        expect(getRainfallText('1mm')).toBe('1mm')
        expect(getRainfallText('')).toBe('강수없음')
    })

    test('getSnowfallText', () => {
        expect(getSnowfallText('5cm')).toBe('5cm')
        expect(getSnowfallText('')).toBe('적설없음')
    })

    test('getWindDirectionText', () => {
        expect(getWindDirectionText(0)).toBe('N')
        expect(getWindDirectionText(90)).toBe('E')
        expect(getWindDirectionText(180)).toBe('S')
        expect(getWindDirectionText(270)).toBe('W')
        expect(getWindDirectionText(360)).toBe('N')
        expect(getWindDirectionText(45)).toBe('NE')
    })

    test('getWindDirectionText 음수 처리', () => {
        expect(getWindDirectionText(-90)).toBe('W')
    })
})

describe('parseCurrentWeather', () => {
    test('KMA 아이템을 파싱한다', () => {
        const items = [
            {
                baseDate: '20250101',
                baseTime: '1200',
                category: 'T1H',
                nx: 60,
                ny: 127,
                obsrValue: '5.2',
            },
            {
                baseDate: '20250101',
                baseTime: '1200',
                category: 'REH',
                nx: 60,
                ny: 127,
                obsrValue: '65',
            },
            {
                baseDate: '20250101',
                baseTime: '1200',
                category: 'RN1',
                nx: 60,
                ny: 127,
                obsrValue: '0',
            },
            {
                baseDate: '20250101',
                baseTime: '1200',
                category: 'VEC',
                nx: 60,
                ny: 127,
                obsrValue: '180',
            },
            {
                baseDate: '20250101',
                baseTime: '1200',
                category: 'WSD',
                nx: 60,
                ny: 127,
                obsrValue: '3.5',
            },
            {
                baseDate: '20250101',
                baseTime: '1200',
                category: 'UUU',
                nx: 60,
                ny: 127,
                obsrValue: '1.2',
            },
            {
                baseDate: '20250101',
                baseTime: '1200',
                category: 'VVV',
                nx: 60,
                ny: 127,
                obsrValue: '-2.3',
            },
            {
                baseDate: '20250101',
                baseTime: '1200',
                category: 'PTY',
                nx: 60,
                ny: 127,
                obsrValue: '0',
            },
        ]

        const result = parseCurrentWeather(items)
        expect(result.temperature).toBe(5.2)
        expect(result.humidity).toBe(65)
        expect(result.rainfall).toBe(0)
        expect(result.windDirection).toBe(180)
        expect(result.windSpeed).toBe(3.5)
        expect(result.windDirectionText).toBe('S')
        expect(result.ptyText).toBe('없음')
    })

    test('빈 배열은 기본값을 반환한다', () => {
        const result = parseCurrentWeather([])
        expect(result.temperature).toBe(0)
        expect(result.humidity).toBe(0)
    })
})

describe('parseUltraForecasts', () => {
    test('시간별로 그룹핑한다', () => {
        const items = [
            {
                baseDate: '20250101',
                baseTime: '1200',
                category: 'T1H',
                fcstDate: '20250101',
                fcstTime: '1300',
                nx: 60,
                ny: 127,
                fcstValue: '6',
            },
            {
                baseDate: '20250101',
                baseTime: '1200',
                category: 'SKY',
                fcstDate: '20250101',
                fcstTime: '1300',
                nx: 60,
                ny: 127,
                fcstValue: '1',
            },
            {
                baseDate: '20250101',
                baseTime: '1200',
                category: 'PTY',
                fcstDate: '20250101',
                fcstTime: '1300',
                nx: 60,
                ny: 127,
                fcstValue: '0',
            },
            {
                baseDate: '20250101',
                baseTime: '1200',
                category: 'T1H',
                fcstDate: '20250101',
                fcstTime: '1400',
                nx: 60,
                ny: 127,
                fcstValue: '7',
            },
        ]

        const result = parseUltraForecasts(items)
        expect(result).toHaveLength(2)
        expect(result[0].fcstTime).toBe('1300')
        expect(result[0].temperature).toBe(6)
        expect(result[0].skyText).toBe('맑음')
        expect(result[1].fcstTime).toBe('1400')
    })
})

describe('parseShortForecasts', () => {
    test('단기예보를 파싱한다', () => {
        const items = [
            {
                baseDate: '20250101',
                baseTime: '0500',
                category: 'TMP',
                fcstDate: '20250101',
                fcstTime: '0600',
                nx: 60,
                ny: 127,
                fcstValue: '3',
            },
            {
                baseDate: '20250101',
                baseTime: '0500',
                category: 'SKY',
                fcstDate: '20250101',
                fcstTime: '0600',
                nx: 60,
                ny: 127,
                fcstValue: '4',
            },
            {
                baseDate: '20250101',
                baseTime: '0500',
                category: 'PTY',
                fcstDate: '20250101',
                fcstTime: '0600',
                nx: 60,
                ny: 127,
                fcstValue: '1',
            },
            {
                baseDate: '20250101',
                baseTime: '0500',
                category: 'POP',
                fcstDate: '20250101',
                fcstTime: '0600',
                nx: 60,
                ny: 127,
                fcstValue: '80',
            },
            {
                baseDate: '20250101',
                baseTime: '0500',
                category: 'PCP',
                fcstDate: '20250101',
                fcstTime: '0600',
                nx: 60,
                ny: 127,
                fcstValue: '1mm미만',
            },
        ]

        const result = parseShortForecasts(items)
        expect(result).toHaveLength(1)
        expect(result[0].temperature).toBe(3)
        expect(result[0].skyText).toBe('흐림')
        expect(result[0].ptyText).toBe('비')
        expect(result[0].pop).toBe(80)
        expect(result[0].rainfall).toBe('1mm미만')
        expect(result[0].rainfallText).toBe('1mm미만')
    })
})
