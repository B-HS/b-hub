import { describe, expect, test } from 'bun:test'
import { buildDeviceUpsertOperations } from '../../../../compose/metrics'
import type { MetricsDeviceUpsert } from '../../../../service/domain/metrics/log'

const SEEN_AT = new Date('2026-09-07T01:02:03.000Z')

const upsertRow = (overrides: Partial<MetricsDeviceUpsert> = {}): MetricsDeviceUpsert => ({
    deviceId: 'mac-1',
    tokenId: 1,
    tokenAlias: 'demo-mbp',
    hostname: 'mbp.local',
    os: 'macOS 26.0 Tahoe',
    arch: 'aarch64',
    agentVersion: 'machboard@0.1.0',
    intervalSec: 60,
    seenAt: SEEN_AT,
    ...overrides,
})

describe('buildDeviceUpsertOperations', () => {
    test('행 하나를 upsert updateOne 연산으로 바꾼다', () => {
        expect(buildDeviceUpsertOperations([upsertRow()])).toEqual([
            {
                updateOne: {
                    filter: { deviceId: 'mac-1' },
                    update: {
                        $set: {
                            tokenId: 1,
                            tokenAlias: 'demo-mbp',
                            lastSeenAt: SEEN_AT,
                            hostname: 'mbp.local',
                            os: 'macOS 26.0 Tahoe',
                            arch: 'aarch64',
                            agentVersion: 'machboard@0.1.0',
                            intervalSec: 60,
                        },
                        $setOnInsert: { deviceId: 'mac-1', firstSeenAt: SEEN_AT },
                    },
                    upsert: true,
                },
            },
        ])
    })

    test('null 메타는 $set 이 아니라 $setOnInsert 로 간다', () => {
        const [operation] = buildDeviceUpsertOperations([
            upsertRow({ hostname: null, os: null, arch: null, agentVersion: null, intervalSec: null }),
        ]) as { updateOne: { update: { $set: Record<string, unknown>; $setOnInsert: Record<string, unknown> } } }[]

        expect(operation.updateOne.update.$set).toEqual({ tokenId: 1, tokenAlias: 'demo-mbp', lastSeenAt: SEEN_AT })
        expect(operation.updateOne.update.$setOnInsert).toEqual({
            deviceId: 'mac-1',
            firstSeenAt: SEEN_AT,
            hostname: null,
            os: null,
            arch: null,
            agentVersion: null,
            intervalSec: null,
        })
    })

    test('여러 행은 입력 순서대로 연산 배열이 된다', () => {
        const operations = buildDeviceUpsertOperations([
            upsertRow({ deviceId: 'a' }),
            upsertRow({ deviceId: 'b' }),
            upsertRow({ deviceId: 'c' }),
        ]) as { updateOne: { filter: { deviceId: string } } }[]

        expect(operations.map((o) => o.updateOne.filter.deviceId)).toEqual(['a', 'b', 'c'])
    })

    test('빈 배열은 빈 연산 배열이다', () => {
        expect(buildDeviceUpsertOperations([])).toEqual([])
    })
})
