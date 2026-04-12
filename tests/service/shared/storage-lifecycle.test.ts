import { describe, expect, test, mock } from 'bun:test'
import { createStorageLifecycleService } from '../../../service/shared/storage-lifecycle'

const createMockDeps = () => ({
    db: {
        getStaleL1Assets: mock(() => Promise.resolve([] as { id: number; s3Key: string; storageTiers: string }[])),
        getPromotionCandidates: mock(
            () => Promise.resolve([] as { id: number; s3Key: string; gdriveFileId: string; storageTiers: string; mimeType: string }[]),
        ),
        updateStorageTiers: mock(() => Promise.resolve()),
        insertLifecycleLog: mock(() => Promise.resolve()),
    },
    l1: {
        del: mock(() => Promise.resolve()),
        upload: mock(() => Promise.resolve({ key: 'test', url: 'https://cdn.example.com/test' })),
    },
    getL3: mock(() =>
        Promise.resolve({
            download: mock(() => {
                const stream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode('file-data'))
                        controller.close()
                    },
                })
                return Promise.resolve(stream)
            }),
        }),
    ),
    evictionDays: 30,
    promotionThreshold: 5,
    l1MaxFileSize: 100 * 1024 * 1024,
})

describe('createStorageLifecycleService', () => {
    describe('evictR2Stale', () => {
        test('30일 미접근 파일을 R2에서 삭제한다', async () => {
            const deps = createMockDeps()
            deps.db.getStaleL1Assets = mock(() =>
                Promise.resolve([
                    { id: 1, s3Key: 'users/u1/uuid/file.jpg', storageTiers: 'L1,L3' },
                    { id: 2, s3Key: 'users/u1/uuid/file2.jpg', storageTiers: 'L1,L2,L3' },
                ]),
            )

            const service = createStorageLifecycleService(deps)
            const result = await service.evictR2Stale()

            expect(result).toBe(2)
            expect(deps.l1.del).toHaveBeenCalledTimes(2)
            expect(deps.db.updateStorageTiers).toHaveBeenCalledTimes(2)
            expect(deps.db.updateStorageTiers).toHaveBeenCalledWith(1, 'L3')
            expect(deps.db.updateStorageTiers).toHaveBeenCalledWith(2, 'L2,L3')
            expect(deps.db.insertLifecycleLog).toHaveBeenCalledTimes(2)
        })

        test('stale 파일이 없으면 0을 반환한다', async () => {
            const deps = createMockDeps()
            const service = createStorageLifecycleService(deps)
            const result = await service.evictR2Stale()

            expect(result).toBe(0)
            expect(deps.l1.del).not.toHaveBeenCalled()
        })

        test('R2 삭제 실패 시 해당 파일은 건너뛴다', async () => {
            const deps = createMockDeps()
            deps.db.getStaleL1Assets = mock(() =>
                Promise.resolve([
                    { id: 1, s3Key: 'users/u1/uuid/fail.jpg', storageTiers: 'L1,L3' },
                    { id: 2, s3Key: 'users/u1/uuid/ok.jpg', storageTiers: 'L1,L3' },
                ]),
            )
            let callCount = 0
            deps.l1.del = mock(async () => {
                callCount++
                if (callCount === 1) throw new Error('R2 error')
            })

            const service = createStorageLifecycleService(deps)
            const result = await service.evictR2Stale()

            expect(result).toBe(1)
        })
    })

    describe('evictLocalFifo', () => {
        test('TODO로 항상 0을 반환한다', async () => {
            const deps = createMockDeps()
            const service = createStorageLifecycleService(deps)
            const result = await service.evictLocalFifo()
            expect(result).toBe(0)
        })
    })

    describe('autoPromote', () => {
        test('accessCount가 높은 L3 전용 파일을 L1으로 승격한다', async () => {
            const deps = createMockDeps()
            deps.db.getPromotionCandidates = mock(() =>
                Promise.resolve([{ id: 1, s3Key: 'users/u1/uuid/popular.jpg', gdriveFileId: 'gdrive-123', storageTiers: 'L3', mimeType: 'image/jpeg' }]),
            )

            const service = createStorageLifecycleService(deps)
            const result = await service.autoPromote()

            expect(result).toBe(1)
            expect(deps.getL3).toHaveBeenCalled()
            expect(deps.l1.upload).toHaveBeenCalledTimes(1)
            expect(deps.db.updateStorageTiers).toHaveBeenCalledWith(1, 'L1,L3')
            expect(deps.db.insertLifecycleLog).toHaveBeenCalledTimes(1)
        })

        test('L3가 null이면 0을 반환한다', async () => {
            const deps = createMockDeps()
            deps.getL3 = mock(() => Promise.resolve(null))
            const service = createStorageLifecycleService(deps)
            const result = await service.autoPromote()
            expect(result).toBe(0)
        })

        test('후보가 없으면 0을 반환한다', async () => {
            const deps = createMockDeps()
            const service = createStorageLifecycleService(deps)
            const result = await service.autoPromote()
            expect(result).toBe(0)
        })
    })
})
