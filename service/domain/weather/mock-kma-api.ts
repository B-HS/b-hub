import type { KMAWeatherItem, KMAVersionItem, KmaApiService } from './kma-api'

const rand = (min: number, max: number) => Math.random() * (max - min) + min
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1))
const pick = <T>(arr: T[]) => arr[randInt(0, arr.length - 1)]

const formatDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}${month}${day}`
}

const formatTime = (hours: number) => `${String(hours).padStart(2, '0')}00`

const makeItem = (base: { baseDate: string; baseTime: string; nx: number; ny: number }, category: string, obsrValue: string): KMAWeatherItem => ({
    ...base,
    category,
    obsrValue,
})

const makeFcstItem = (
    base: { baseDate: string; baseTime: string; nx: number; ny: number },
    category: string,
    fcstDate: string,
    fcstTime: string,
    fcstValue: string,
): KMAWeatherItem => ({
    ...base,
    category,
    fcstDate,
    fcstTime,
    fcstValue,
})

export const createMockKmaApiService = (): KmaApiService => {
    const getUltraSrtNcst = async (nx: number, ny: number) => {
        const now = new Date()
        const base = { baseDate: formatDate(now), baseTime: formatTime(now.getHours()), nx, ny }

        const items: KMAWeatherItem[] = [
            makeItem(base, 'T1H', rand(-10, 40).toFixed(1)),
            makeItem(base, 'REH', String(randInt(30, 100))),
            makeItem(base, 'RN1', rand(0, 10).toFixed(1)),
            makeItem(base, 'VEC', String(randInt(0, 360))),
            makeItem(base, 'WSD', rand(0, 15).toFixed(1)),
            makeItem(base, 'UUU', rand(-10, 10).toFixed(1)),
            makeItem(base, 'VVV', rand(-10, 10).toFixed(1)),
            makeItem(base, 'PTY', String(pick([0, 0, 0, 1, 2, 3]))),
        ]

        return { success: true as const, data: items }
    }

    const getUltraSrtFcst = async (nx: number, ny: number) => {
        const now = new Date()
        const base = { baseDate: formatDate(now), baseTime: formatTime(now.getHours()), nx, ny }
        const categories = ['T1H', 'REH', 'RN1', 'SKY', 'PTY', 'LGT', 'VEC', 'WSD', 'UUU', 'VVV']
        const items: KMAWeatherItem[] = []

        for (let h = 1; h <= 6; h++) {
            const fcstDate = new Date(now)
            fcstDate.setHours(now.getHours() + h)
            const fd = formatDate(fcstDate)
            const ft = formatTime(fcstDate.getHours())

            for (const cat of categories) {
                let value: string
                switch (cat) {
                    case 'T1H':
                        value = rand(-10, 40).toFixed(1)
                        break
                    case 'REH':
                        value = String(randInt(30, 100))
                        break
                    case 'RN1':
                        value = rand(0, 10).toFixed(1)
                        break
                    case 'SKY':
                        value = String(pick([1, 3, 4]))
                        break
                    case 'PTY':
                        value = String(pick([0, 0, 0, 1, 2, 3]))
                        break
                    case 'LGT':
                        value = String(pick([0, 0, 0, 1]))
                        break
                    case 'VEC':
                        value = String(randInt(0, 360))
                        break
                    case 'WSD':
                        value = rand(0, 15).toFixed(1)
                        break
                    case 'UUU':
                        value = rand(-10, 10).toFixed(1)
                        break
                    case 'VVV':
                        value = rand(-10, 10).toFixed(1)
                        break
                    default:
                        value = '0'
                }
                items.push(makeFcstItem(base, cat, fd, ft, value))
            }
        }

        return { success: true as const, data: items }
    }

    const getVilageFcst = async (nx: number, ny: number) => {
        const now = new Date()
        const base = { baseDate: formatDate(now), baseTime: formatTime(now.getHours()), nx, ny }
        const items: KMAWeatherItem[] = []

        for (let d = 0; d < 3; d++) {
            for (let h = 0; h < 24; h += 3) {
                const fcstDate = new Date(now)
                fcstDate.setDate(now.getDate() + d)
                const fd = formatDate(fcstDate)
                const ft = formatTime(h)

                const categories: [string, string][] = [
                    ['TMP', rand(-10, 40).toFixed(0)],
                    ['REH', String(randInt(30, 100))],
                    ['SKY', String(pick([1, 3, 4]))],
                    ['PTY', String(pick([0, 0, 0, 1, 2, 3, 4]))],
                    ['POP', String(randInt(0, 100))],
                    ['PCP', pick(['강수없음', '강수없음', '1.0mm', '5.0mm'])],
                    ['SNO', pick(['적설없음', '적설없음', '1.0cm'])],
                    ['VEC', String(randInt(0, 360))],
                    ['WSD', rand(0, 15).toFixed(1)],
                ]

                if (h === 6) categories.push(['TMN', rand(-15, 10).toFixed(0)])
                if (h === 15) categories.push(['TMX', rand(10, 40).toFixed(0)])

                for (const [cat, value] of categories) {
                    items.push(makeFcstItem(base, cat, fd, ft, value))
                }
            }
        }

        return { success: true as const, data: items }
    }

    const getFcstVersion = async (ftype: string) => {
        const now = new Date()
        const version = `${formatDate(now)}${formatTime(now.getHours())}${String(now.getMinutes()).padStart(2, '0')}00`
        const data: KMAVersionItem = { filetype: ftype, version }
        return { success: true as const, data }
    }

    return { getUltraSrtNcst, getUltraSrtFcst, getVilageFcst, getFcstVersion }
}
