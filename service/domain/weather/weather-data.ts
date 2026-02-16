import type { KMAWeatherItem } from './kma-api'

const SKY_CODES: Record<number, string> = {
    1: '맑음',
    3: '구름많음',
    4: '흐림',
}

const PTY_CODES: Record<number, string> = {
    0: '없음',
    1: '비',
    2: '비/눈',
    3: '눈',
    5: '빗방울',
    6: '빗방울눈날림',
    7: '눈날림',
}

const PTY_CODES_SHORT: Record<number, string> = {
    0: '없음',
    1: '비',
    2: '비/눈',
    3: '눈',
    4: '소나기',
}

const DIRECTIONS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

export const getSkyText = (code: number) => SKY_CODES[code] ?? '알수없음'
export const getPtyText = (code: number) => PTY_CODES[code] ?? '알수없음'
export const getPtyTextShort = (code: number) => PTY_CODES_SHORT[code] ?? '알수없음'
export const getRainfallText = (value: string) => value || '강수없음'
export const getSnowfallText = (value: string) => value || '적설없음'
export const getWindDirectionText = (degrees: number) => {
    const normalized = ((degrees % 360) + 360) % 360
    const index = Math.round(normalized / 22.5) % 16
    return DIRECTIONS[index]
}

export const parseCurrentWeather = (items: KMAWeatherItem[]) => {
    const data: Record<string, string> = {}
    for (const item of items) {
        data[item.category] = item.obsrValue || ''
    }

    const pty = parseInt(data.PTY) || 0
    const windDirection = parseInt(data.VEC) || 0

    return {
        temperature: parseFloat(data.T1H) || 0,
        humidity: parseInt(data.REH) || 0,
        rainfall: parseFloat(data.RN1) || 0,
        windDirection,
        windSpeed: parseFloat(data.WSD) || 0,
        windU: parseFloat(data.UUU) || 0,
        windV: parseFloat(data.VVV) || 0,
        pty,
        windDirectionText: getWindDirectionText(windDirection),
        ptyText: getPtyText(pty),
    }
}

export const parseUltraForecasts = (items: KMAWeatherItem[]) => {
    const forecasts = new Map<string, Record<string, string>>()
    for (const item of items) {
        const key = (item.fcstDate || '') + (item.fcstTime || '')
        if (!forecasts.has(key)) {
            forecasts.set(key, {
                fcstDate: item.fcstDate || '',
                fcstTime: item.fcstTime || '',
            })
        }
        const entry = forecasts.get(key)
        if (entry) entry[item.category] = item.fcstValue || ''
    }

    return Array.from(forecasts.values()).map((f) => ({
        fcstDate: f.fcstDate,
        fcstTime: f.fcstTime,
        temperature: parseFloat(f.T1H) || 0,
        humidity: parseInt(f.REH) || 0,
        sky: parseInt(f.SKY) || 1,
        pty: parseInt(f.PTY) || 0,
        rainfall: parseFloat(f.RN1) || 0,
        lightning: parseFloat(f.LGT) || 0,
        windDirection: parseInt(f.VEC) || 0,
        windSpeed: parseFloat(f.WSD) || 0,
        skyText: getSkyText(parseInt(f.SKY) || 1),
        ptyText: getPtyText(parseInt(f.PTY) || 0),
        windDirectionText: getWindDirectionText(parseInt(f.VEC) || 0),
    }))
}

export const parseShortForecasts = (items: KMAWeatherItem[]) => {
    const forecasts = new Map<string, Record<string, string>>()
    for (const item of items) {
        const key = (item.fcstDate || '') + (item.fcstTime || '')
        if (!forecasts.has(key)) {
            forecasts.set(key, {
                fcstDate: item.fcstDate || '',
                fcstTime: item.fcstTime || '',
            })
        }
        const entry = forecasts.get(key)
        if (entry) entry[item.category] = item.fcstValue || ''
    }

    return Array.from(forecasts.values()).map((f) => ({
        fcstDate: f.fcstDate,
        fcstTime: f.fcstTime,
        temperature: f.TMP ? parseFloat(f.TMP) : null,
        tempMin: f.TMN ? parseFloat(f.TMN) : null,
        tempMax: f.TMX ? parseFloat(f.TMX) : null,
        humidity: f.REH ? parseInt(f.REH) : null,
        sky: parseInt(f.SKY) || 1,
        pty: parseInt(f.PTY) || 0,
        pop: f.POP ? parseInt(f.POP) : null,
        rainfall: f.PCP || null,
        snowfall: f.SNO || null,
        windDirection: parseInt(f.VEC) || 0,
        windSpeed: parseFloat(f.WSD) || 0,
        skyText: getSkyText(parseInt(f.SKY) || 1),
        ptyText: getPtyTextShort(parseInt(f.PTY) || 0),
        windDirectionText: getWindDirectionText(parseInt(f.VEC) || 0),
        rainfallText: getRainfallText(f.PCP || '강수없음'),
        snowfallText: getSnowfallText(f.SNO || '적설없음'),
    }))
}
