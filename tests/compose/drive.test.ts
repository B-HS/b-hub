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

const DUPLICATE_KEY_ERROR = Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' })

const ASSET_ROW = [
    1,
    'user-1',
    'users/user-1/uuid/photo.jpg',
    'photo.jpg',
    'image/jpeg',
    100,
    '',
    null,
    null,
    0,
    'uploading',
    'tok',
    null,
    null,
    '',
    0,
    null,
    new Date(),
    new Date(),
]

const createCompose = (respond: (sql: string) => { rows: unknown[][] }) => {
    const db = drizzle(async (sql) => respond(sql), { schema, mode: 'default' }) as unknown as ComposeDriveArgs['db']

    return composeDrive({
        db,
        env: { UPLOAD_SERVER_SECRET: 'secret' } as unknown as ComposeDriveArgs['env'],
        storageService: {
            del: async () => {},
            upload: async () => ({ key: 'k', url: 'https://cdn.example.com/k' }),
            getUrl: (key: string) => `https://cdn.example.com/${key}`,
            getPresignedUrl: async () => 'https://presigned.example.com/f',
            getObjectStream: async () => null,
        } as unknown as ComposeDriveArgs['storageService'],
        imageProcessor: {} as unknown as ComposeDriveArgs['imageProcessor'],
        gdriveStorageService: null,
        initGdriveStorage: async () => null as unknown as Awaited<ReturnType<ComposeDriveArgs['initGdriveStorage']>>,
    })
}

describe('composeDrive assetDb 유니크 위반 처리', () => {
    test('insert 가 ER_DUP_ENTRY 를 만나면 null 을 돌려 서비스가 DRIVE_DUPLICATE_FILE 을 던진다', async () => {
        const composed = createCompose((sql) => {
            if (sql.startsWith('insert into `cloud_assets`')) throw DUPLICATE_KEY_ERROR
            if (sql.includes('COALESCE')) return { rows: [[0]] }
            return { rows: [] }
        })

        await expect(
            composed.driveAssetService.prepare('user-1', {
                originalName: 'photo.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: 100,
                folderId: null,
                fileHash: 'dup-hash',
            }),
        ).rejects.toMatchObject({ code: 'DRIVE_DUPLICATE_FILE', statusCode: 409 })
    })

    test('insert 의 다른 DB 에러는 그대로 전파한다', async () => {
        const composed = createCompose((sql) => {
            if (sql.startsWith('insert into `cloud_assets`')) throw new Error('connection lost')
            if (sql.includes('COALESCE')) return { rows: [[0]] }
            return { rows: [] }
        })

        await expect(
            composed.driveAssetService.prepare('user-1', {
                originalName: 'photo.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: 100,
                folderId: null,
                fileHash: 'other-hash',
            }),
        ).rejects.not.toMatchObject({ code: 'DRIVE_DUPLICATE_FILE' })
    })

    test('update 가 ER_DUP_ENTRY 를 만나면 null 을 돌려 complete 가 DRIVE_DUPLICATE_FILE 을 던진다', async () => {
        const composed = createCompose((sql) => {
            if (sql.startsWith('update `cloud_assets`') && sql.includes('`file_hash`')) throw DUPLICATE_KEY_ERROR
            if (sql.startsWith('update `cloud_assets`')) return { rows: [{ insertId: 0, affectedRows: 1 }] as unknown as unknown[][] }
            if (sql.startsWith('select `id`, `user_id`')) return { rows: [ASSET_ROW] }
            if (sql.includes('COALESCE')) return { rows: [[0]] }
            return { rows: [] }
        })

        await expect(
            composed.driveAssetService.complete(1, 'tok', {
                fileHash: 'dup-hash',
                storageTiers: 'L1',
                gdriveFileId: null,
                localPath: null,
                thumbnailBase64: null,
            }),
        ).rejects.toMatchObject({ code: 'DRIVE_DUPLICATE_FILE', statusCode: 409 })
    })
})
