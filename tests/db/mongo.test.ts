import { afterAll, describe, expect, test } from 'bun:test'
import { closeMongo, getMongo, resetMongo } from '../../db/mongo'

const TEST_URI = 'mongodb://127.0.0.1:1/reset-mongo-test'

afterAll(async () => {
    await closeMongo()
})

describe('resetMongo 동시 재연결 경합', () => {
    test('인자 없이 부르면 현재 인스턴스를 교체한다', async () => {
        const first = getMongo(TEST_URI)
        await resetMongo()
        const second = getMongo(TEST_URI)
        expect(second).not.toBe(first)
    })

    test('오래된 인스턴스를 넘기면 이미 교체된 새 인스턴스는 닫지 않는다', async () => {
        const stale = getMongo(TEST_URI)
        await resetMongo(stale)
        const fresh = getMongo(TEST_URI)
        expect(fresh).not.toBe(stale)

        await resetMongo(stale)
        expect(getMongo(TEST_URI)).toBe(fresh)
    })

    test('현재 인스턴스를 넘기면 교체한다', async () => {
        const current = getMongo(TEST_URI)
        await resetMongo(current)
        expect(getMongo(TEST_URI)).not.toBe(current)
    })
})
