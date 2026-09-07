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

const createCapturingCompose = (respond: (sql: string) => { rows: unknown[][] }) => {
    const queries: { sql: string; params: unknown[] }[] = []
    const db = drizzle(
        async (sql, params) => {
            queries.push({ sql, params })
            return respond(sql)
        },
        { schema, mode: 'default' },
    ) as unknown as ComposeDriveArgs['db']

    const composed = composeDrive({
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

    return { composed, queries }
}

describe('composeDrive assetDb.touchAccess', () => {
    test('accessCount 를 읽지 않고 access_count + 1 로 원자 증가시킨다', async () => {
        const { composed, queries } = createCapturingCompose((sql) => {
            if (sql.startsWith('select `id`, `user_id`')) return { rows: [ASSET_ROW] }
            return { rows: [{ insertId: 0, affectedRows: 1 }] as unknown as unknown[][] }
        })

        await composed.driveAssetService.getDetail(1, 'user-1')

        const updateQuery = queries.find((q) => q.sql.startsWith('update `cloud_assets`'))
        expect(updateQuery?.sql).toContain('`access_count` = `cloud_assets`.`access_count` + 1')
        expect(updateQuery?.sql).toContain('`last_viewed_at` = ?')
        expect(updateQuery?.params.at(-1)).toBe(1)
        expect(updateQuery?.params).not.toContain(0)
    })

    test('download 도 같은 원자 증가 쿼리를 사용한다', async () => {
        const { composed, queries } = createCapturingCompose((sql) => {
            if (sql.startsWith('select `id`, `user_id`')) return { rows: [ASSET_ROW] }
            return { rows: [{ insertId: 0, affectedRows: 1 }] as unknown as unknown[][] }
        })

        await expect(composed.driveAssetService.download(1, 'user-1')).rejects.toMatchObject({ code: 'DRIVE_ALL_TIERS_FAILED' })

        const updateQuery = queries.find((q) => q.sql.startsWith('update `cloud_assets`'))
        expect(updateQuery?.sql).toContain('`access_count` = `cloud_assets`.`access_count` + 1')
    })
})

describe('composeDrive assetDb.list 목록·카운트 병렬', () => {
    test('목록 쿼리를 먼저 보내고 COUNT 쿼리가 그 응답을 기다리지 않는다', async () => {
        const queries: string[] = []
        let releaseListQuery = () => {}
        const countQueryStarted = new Promise<void>((resolve) => {
            releaseListQuery = resolve
        })

        const db = drizzle(
            async (sql) => {
                queries.push(sql)
                if (sql.includes('COUNT(*)')) {
                    releaseListQuery()
                    return { rows: [[0]] }
                }
                await countQueryStarted
                return { rows: [] }
            },
            { schema, mode: 'default' },
        ) as unknown as ComposeDriveArgs['db']

        const composed = composeDrive({
            db,
            env: { UPLOAD_SERVER_SECRET: 'secret' } as unknown as ComposeDriveArgs['env'],
            storageService: {} as unknown as ComposeDriveArgs['storageService'],
            imageProcessor: {} as unknown as ComposeDriveArgs['imageProcessor'],
            gdriveStorageService: null,
            initGdriveStorage: async () => null as unknown as Awaited<ReturnType<ComposeDriveArgs['initGdriveStorage']>>,
        })

        const result = await composed.driveAssetService.list('user-1', { page: 1, limit: 20, sort: 'created', order: 'desc' })

        expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 })
        expect(queries).toHaveLength(2)
        expect(queries[0].startsWith('select `id`, `user_id`')).toBe(true)
        expect(queries[1]).toContain('COUNT(*)')
    })

    test('목록 응답 필드와 total 은 HEAD 와 동일하게 매핑된다', async () => {
        const createdAt = new Date('2026-01-02T03:04:05.000Z')
        const { composed } = createCapturingCompose((sql) => {
            if (sql.includes('COUNT(*)')) return { rows: [[3]] }
            return { rows: [[...ASSET_ROW.slice(0, 17), createdAt, createdAt]] }
        })

        const result = await composed.driveAssetService.list('user-1', { page: 2, limit: 20, sort: 'created', order: 'desc' })

        expect(result).toEqual({
            data: [
                {
                    id: 1,
                    originalName: 'photo.jpg',
                    mimeType: 'image/jpeg',
                    sizeBytes: 100,
                    folderId: null,
                    isPublic: false,
                    storageTiers: '',
                    uploadStatus: 'uploading',
                    thumbnail: null,
                    createdAt: createdAt.toISOString(),
                    updatedAt: createdAt.toISOString(),
                },
            ],
            total: 3,
            page: 2,
            limit: 20,
        })
    })
})

describe('composeDrive folderDb 배치 조회', () => {
    test('재귀 삭제가 폴더·에셋을 IN 절로 일괄 조회한다', async () => {
        const folderRow = ['folder-1', 'user-1', null, '사진', new Date(), new Date()]
        const { composed, queries } = createCapturingCompose((sql) => {
            if (sql.startsWith('select `id`, `user_id`, `parent_id`') && sql.includes('`id` = ?')) return { rows: [folderRow] }
            if (sql.startsWith('delete')) return { rows: [{ insertId: 0, affectedRows: 1 }] as unknown as unknown[][] }
            return { rows: [] }
        })

        const result = await composed.driveFolderService.remove('folder-1', 'user-1')

        expect(result).toEqual({ id: 'folder-1' })
        const folderBatchQuery = queries.find((q) => q.sql.includes('`drive_folders`.`parent_id` in (?)'))
        expect(folderBatchQuery?.params).toEqual(['user-1', 'folder-1'])
        const assetBatchQuery = queries.find((q) => q.sql.includes('`cloud_assets`.`folder_id` in (?)'))
        expect(assetBatchQuery?.params).toEqual(['folder-1'])
        expect(queries.some((q) => q.sql.includes('`cloud_assets`.`folder_id` = ?'))).toBe(false)
    })
})

describe('composeDrive assetDb.list stale 필터', () => {
    test('stale 조건을 drizzle 연산자(not in · >=)로 만들고 Date 를 파라미터로 바인딩한다', async () => {
        const { composed, queries } = createCapturingCompose((sql) => {
            if (sql.includes('COUNT(*)')) return { rows: [[0]] }
            return { rows: [] }
        })

        await composed.driveAssetService.list('user-1', { page: 1, limit: 20, sort: 'created', order: 'desc' })

        const listQuery = queries[0]
        expect(listQuery.sql).toContain('`cloud_assets`.`upload_status` not in (?, ?)')
        expect(listQuery.sql).toContain('`cloud_assets`.`created_at` >= ?')
        expect(listQuery.sql).not.toContain('NOT (')
        expect(listQuery.params.slice(0, 4)).toEqual(['user-1', 'preparing', 'failed', expect.any(String)])
    })

    test('folderId=root 와 mimeType 필터를 stale 조건과 함께 AND 로 결합한다', async () => {
        const { composed, queries } = createCapturingCompose((sql) => {
            if (sql.includes('COUNT(*)')) return { rows: [[0]] }
            return { rows: [] }
        })

        await composed.driveAssetService.list('user-1', {
            page: 1,
            limit: 20,
            sort: 'name',
            order: 'asc',
            folderId: 'root',
            mimeType: 'image/',
        })

        expect(queries[0].sql).toContain('`cloud_assets`.`folder_id` is null')
        expect(queries[0].sql).toContain('`cloud_assets`.`mime_type` like ?')
        expect(queries[0].sql).toContain('`cloud_assets`.`upload_status` not in (?, ?)')
    })
})
