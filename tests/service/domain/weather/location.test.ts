import { describe, expect, test } from 'bun:test'
import { createLocationService } from '../../../../service/domain/weather/location'

const mockLocations = [
    {
        code: '1100000000',
        level1: '서울특별시',
        level2: '종로구',
        level3: '청운효자동',
        gridX: 60,
        gridY: 127,
        longitude: 126.97,
        latitude: 37.57,
    },
    {
        code: '1100000001',
        level1: '서울특별시',
        level2: '중구',
        level3: '명동',
        gridX: 60,
        gridY: 126,
        longitude: 126.98,
        latitude: 37.56,
    },
    {
        code: '2600000000',
        level1: '부산광역시',
        level2: '해운대구',
        level3: null,
        gridX: 99,
        gridY: 75,
        longitude: 129.16,
        latitude: 35.16,
    },
]

const createService = () => createLocationService({ locations: mockLocations })

describe('createLocationService', () => {
    test('getAll은 전체 목록을 반환한다', () => {
        const service = createService()
        expect(service.getAll()).toHaveLength(3)
    })

    test('search는 level1으로 검색한다', () => {
        const service = createService()
        const results = service.search('서울')
        expect(results).toHaveLength(2)
    })

    test('search는 level2로 검색한다', () => {
        const service = createService()
        const results = service.search('종로')
        expect(results).toHaveLength(1)
    })

    test('search는 level3으로 검색한다', () => {
        const service = createService()
        const results = service.search('명동')
        expect(results).toHaveLength(1)
    })

    test('search는 대소문자 무시한다', () => {
        const service = createService()
        const results = service.search('부산')
        expect(results).toHaveLength(1)
    })

    test('search 결과가 없으면 빈 배열을 반환한다', () => {
        const service = createService()
        const results = service.search('존재하지않는지역')
        expect(results).toHaveLength(0)
    })

    test('getByGrid는 격자 좌표로 찾는다', () => {
        const service = createService()
        const result = service.getByGrid(60, 127)
        expect(result).not.toBeNull()
        expect(result!.level2).toBe('종로구')
    })

    test('getByGrid는 없으면 null을 반환한다', () => {
        const service = createService()
        const result = service.getByGrid(999, 999)
        expect(result).toBeNull()
    })

    test('findNearest는 가장 가까운 위치를 반환한다', () => {
        const service = createService()
        const result = service.findNearest(37.57, 126.97)
        expect(result).not.toBeNull()
        expect(result!.level2).toBe('종로구')
    })

    test('findNearest는 범위 밖이면 null을 반환한다', () => {
        const service = createService()
        const result = service.findNearest(0, 0)
        expect(result).toBeNull()
    })
})
