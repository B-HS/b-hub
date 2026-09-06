import { describe, expect, test } from 'bun:test'
import { createDeviceKeyService, resolveDeviceIdentity } from '../../../../service/domain/logs/device-key'

const createMockDb = (countResult: number) => ({
    select: () => ({ from: () => ({ where: () => Promise.resolve([{ count: countResult }]) }) }),
})

const createService = (countResult: number) => createDeviceKeyService({ db: createMockDb(countResult) as never })

describe('resolveDeviceIdentity', () => {
    test('키에 deviceId 가 있으면 그 값을 식별자로 쓴다', () => {
        expect(resolveDeviceIdentity({ id: 7, deviceId: 'AA:BB:CC' })).toBe('AA:BB:CC')
    })

    test('키에 deviceId 가 없으면 키 id 기준 식별자를 만든다', () => {
        expect(resolveDeviceIdentity({ id: 7, deviceId: null })).toBe('key:7')
    })
})

describe('createDeviceKeyService.checkRateLimit', () => {
    test('한도 미만이면 true 를 반환한다', async () => {
        expect(await createService(5).checkRateLimit('device-1', 2000)).toBe(true)
    })

    test('한도에 도달하면 false 를 반환한다', async () => {
        expect(await createService(2000).checkRateLimit('device-1', 2000)).toBe(false)
    })

    test('배치 건수와 무관하게 저장 건수만으로 판정한다', async () => {
        expect(await createService(1999).checkRateLimit('device-1', 2000)).toBe(true)
    })
})
