import { describe, expect, test } from 'bun:test'
import { latLonToGrid, gridToLatLon } from '../../../../service/domain/weather/grid-converter'

describe('latLonToGrid', () => {
    test('서울 좌표를 격자로 변환한다', () => {
        const result = latLonToGrid(37.5665, 126.978)
        expect(result.x).toBe(60)
        expect(result.y).toBe(127)
    })

    test('부산 좌표를 격자로 변환한다', () => {
        const result = latLonToGrid(35.1796, 129.0756)
        expect(result.x).toBeGreaterThan(0)
        expect(result.y).toBeGreaterThan(0)
    })

    test('제주 좌표를 격자로 변환한다', () => {
        const result = latLonToGrid(33.4996, 126.5312)
        expect(result.x).toBeGreaterThan(0)
        expect(result.y).toBeGreaterThan(0)
    })

    test('정수 격자 좌표를 반환한다', () => {
        const result = latLonToGrid(37.5, 127.0)
        expect(Number.isInteger(result.x)).toBe(true)
        expect(Number.isInteger(result.y)).toBe(true)
    })
})

describe('gridToLatLon', () => {
    test('서울 격자를 좌표로 변환한다', () => {
        const result = gridToLatLon(60, 127)
        expect(result.lat).toBeCloseTo(37.57, 0)
        expect(result.lon).toBeCloseTo(126.98, 0)
    })

    test('왕복 변환이 근사하게 일치한다', () => {
        const original = { lat: 37.5, lon: 127.0 }
        const grid = latLonToGrid(original.lat, original.lon)
        const back = gridToLatLon(grid.x, grid.y)
        expect(back.lat).toBeCloseTo(original.lat, 0)
        expect(back.lon).toBeCloseTo(original.lon, 0)
    })
})
