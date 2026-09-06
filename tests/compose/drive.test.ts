import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/mysql-proxy'
import * as schema from '../../db/schema'
import { composeDrive } from '../../compose/drive'

type ComposeDriveArgs = Parameters<typeof composeDrive>[0]

const createRecordingCompose = () => {
    const queries: { sql: string; params: unknown[] }[] = []
    const db = drizzle(
        async (sql, params) => {
            queries.push({ sql, params })
            return { rows: [] }
        },
        { schema, mode: 'default' },
    ) as unknown as ComposeDriveArgs['db']

    const composed = composeDrive({
        db,
        env: { UPLOAD_SERVER_SECRET: 'secret' } as unknown as ComposeDriveArgs['env'],
        storageService: {
            del: async () => {},
            upload: async () => ({ key: 'k', url: 'https://cdn.example.com/k' }),
        } as unknown as ComposeDriveArgs['storageService'],
        imageProcessor: {} as unknown as ComposeDriveArgs['imageProcessor'],
        gdriveStorageService: null,
        initGdriveStorage: async () =>
            ({ download: async () => new ReadableStream() }) as unknown as Awaited<ReturnType<ComposeDriveArgs['initGdriveStorage']>>,
    })

    return { composed, queries }
}

describe('composeDrive storageLifecycleService db', () => {
    describe('getStaleL1Assets', () => {
        test('L1 조건과 OR 조건을 괄호로 묶어 AND 로 결합한다', async () => {
            const { composed, queries } = createRecordingCompose()
            await composed.storageLifecycleService.evictR2Stale()

            expect(queries).toHaveLength(1)
            expect(queries[0].sql).toContain('`cloud_assets`.`storage_tiers` like ?')
            expect(queries[0].sql).toContain(
                '(`cloud_assets`.`last_viewed_at` < ? or (`cloud_assets`.`last_viewed_at` is null and `cloud_assets`.`created_at` < ?))',
            )
            expect(queries[0].params[0]).toBe('%L1%')
        })

        test('lastViewedAt 이 NULL 이면 createdAt 을 기준으로 판정한다', async () => {
            const { composed, queries } = createRecordingCompose()
            await composed.storageLifecycleService.evictR2Stale()

            expect(queries[0].sql).toContain('`cloud_assets`.`last_viewed_at` is null and `cloud_assets`.`created_at` < ?')
            expect(queries[0].params[1]).toBe(queries[0].params[2])
        })

        test('L3 사본이 있는 자산만 stale 후보로 조회한다', async () => {
            const { composed, queries } = createRecordingCompose()
            await composed.storageLifecycleService.evictR2Stale()

            expect(queries[0].sql).toContain('`cloud_assets`.`gdrive_file_id` is not null')
        })
    })

    describe('getPromotionCandidates', () => {
        test('최근 조회 기준(last_viewed_at >= cutoff)을 조건에 포함한다', async () => {
            const { composed, queries } = createRecordingCompose()
            await composed.storageLifecycleService.autoPromote()

            expect(queries).toHaveLength(1)
            expect(queries[0].sql).toContain('`cloud_assets`.`last_viewed_at` >= ?')
            expect(typeof queries[0].params[2]).toBe('string')
        })
    })
})
