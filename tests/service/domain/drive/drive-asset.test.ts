import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { createDriveAssetService } from '../../../../service/domain/drive/drive-asset'

const now = new Date()

const createMockDeps = () => ({
    storage: {
        upload: mock(() => Promise.resolve({ key: 'users/user-1/uuid/photo.jpg', url: 'https://cdn.example.com/users/user-1/uuid/photo.jpg' })),
        del: mock(() => Promise.resolve()),
        getUrl: (key: string) => `https://cdn.example.com/${key}`,
        getPresignedUrl: mock(() => Promise.resolve('https://presigned.example.com/file?token=abc')),
    },
    gdriveStorage: null as { download: () => Promise<ReadableStream>; del: () => Promise<void> } | null,
    imageProcessor: {
        resize: mock(() => Promise.resolve(Buffer.from('resized'))),
        toWebp: mock(() => Promise.resolve(Buffer.from('thumbnail-webp'))),
    },
    folderDb: {
        getById: mock(() => Promise.resolve({ id: 'folder-1', userId: 'user-1' })),
    },
    db: {
        insert: mock(() => Promise.resolve({ id: 1 })),
        getById: mock(() =>
            Promise.resolve({
                id: 1,
                userId: 'user-1',
                s3Key: 'users/user-1/uuid/photo.jpg',
                originalName: 'photo.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: 5000,
                fileHash: 'abc123',
                folderId: null as string | null,
                thumbnailBlob: Buffer.from('thumb'),
                isPublic: false,
                uploadStatus: 'ready',
                uploadToken: null,
                localPath: null,
                gdriveFileId: null,
                storageTiers: 'L1',
                accessCount: 0,
                lastViewedAt: null,
                createdAt: now,
                updatedAt: now,
            }),
        ),
        getByUserAndHash: mock(() => Promise.resolve(null)),
        list: mock(() =>
            Promise.resolve({
                data: [
                    {
                        id: 1,
                        userId: 'user-1',
                        s3Key: 'users/user-1/uuid/photo.jpg',
                        originalName: 'photo.jpg',
                        mimeType: 'image/jpeg',
                        sizeBytes: 5000,
                        fileHash: 'abc123',
                        folderId: null as string | null,
                        thumbnailBlob: Buffer.from('thumb'),
                        isPublic: false,
                        uploadStatus: 'ready',
                        uploadToken: null,
                        localPath: null,
                        gdriveFileId: null,
                        storageTiers: 'L1',
                        accessCount: 0,
                        lastViewedAt: null,
                        createdAt: now,
                        updatedAt: now,
                    },
                ],
                total: 1,
            }),
        ),
        update: mock(() => Promise.resolve()),
        remove: mock(() => Promise.resolve()),
        getTotalSizeByUser: mock(() => Promise.resolve(1000)),
    },
    generateId: () => 'test-uuid',
    defaultQuotaBytes: 10 * 1024 * 1024,
    getUserQuotaBytes: mock(() => Promise.resolve(10 * 1024 * 1024)),
    uploadServerSecret: 'test-secret',
})

describe('createDriveAssetService', () => {
    describe('upload', () => {
        test('파일을 R2에 업로드하고 DB에 저장한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(1020).fill(0)])], 'photo.jpg', { type: 'image/jpeg' })
            const result = await service.upload(file, 'user-1')

            expect(result.id).toBe(1)
            expect(result.originalName).toBe('photo.jpg')
            expect(result.mimeType).toBe('image/jpeg')
            expect(deps.storage.upload).toHaveBeenCalled()
            expect(deps.db.insert).toHaveBeenCalled()
        })

        test('이미지 파일이면 100x100 WebP 썸네일을 생성한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(1020).fill(0)])], 'photo.png', { type: 'image/png' })
            await service.upload(file, 'user-1')

            expect(deps.imageProcessor.resize).toHaveBeenCalledWith(expect.any(Buffer), 100, 100)
            expect(deps.imageProcessor.toWebp).toHaveBeenCalledWith(expect.any(Buffer), 60)
            expect(deps.db.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    thumbnailBlob: expect.any(Buffer),
                }),
            )
        })

        test('이미지가 아닌 파일은 썸네일을 null로 저장한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const file = new File([new ArrayBuffer(1024)], 'doc.pdf', { type: 'application/pdf' })
            await service.upload(file, 'user-1')

            expect(deps.imageProcessor.resize).not.toHaveBeenCalled()
            expect(deps.db.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    thumbnailBlob: null,
                }),
            )
        })

        test('100MB 초과 파일을 거부한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const file = new File([new ArrayBuffer(101 * 1024 * 1024)], 'huge.zip', { type: 'application/zip' })
            await expect(service.upload(file, 'user-1')).rejects.toMatchObject({ code: 'DRIVE_FILE_TOO_LARGE' })
        })

        test('동일 해시 파일이 존재하면 중복 에러를 throw한다 (image)', async () => {
            const deps = createMockDeps()
            deps.db.getByUserAndHash = mock(() =>
                Promise.resolve({
                    id: 1,
                    userId: 'user-1',
                    s3Key: 'existing',
                    originalName: 'existing.jpg',
                    mimeType: 'image/jpeg',
                    sizeBytes: 1024,
                    fileHash: 'abc',
                    folderId: null,
                    thumbnailBlob: null,
                    isPublic: false,
                    lastViewedAt: null,
                    createdAt: now,
                    updatedAt: now,
                }),
            )
            const service = createDriveAssetService(deps)

            const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(1020).fill(0)])], 'dup.jpg', { type: 'image/jpeg' })
            await expect(service.upload(file, 'user-1')).rejects.toMatchObject({ code: 'DRIVE_DUPLICATE_FILE' })
        })

        test('쿼터 초과 시 에러를 throw한다', async () => {
            const deps = createMockDeps()
            deps.getUserQuotaBytes = mock(() => Promise.resolve(2000))
            deps.db.getTotalSizeByUser = mock(() => Promise.resolve(1500))
            const service = createDriveAssetService(deps)

            const file = new File([new ArrayBuffer(1024)], 'file.txt', { type: 'text/plain' })
            await expect(service.upload(file, 'user-1')).rejects.toMatchObject({ code: 'DRIVE_QUOTA_EXCEEDED' })
        })

        test('썸네일 생성 실패 시 null로 저장하고 업로드를 계속한다', async () => {
            const deps = createMockDeps()
            deps.imageProcessor.resize = mock(() => Promise.reject(new Error('resize failed')))
            const service = createDriveAssetService(deps)

            const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(1020).fill(0)])], 'broken.jpg', { type: 'image/jpeg' })
            const result = await service.upload(file, 'user-1')

            expect(result.id).toBe(1)
            expect(deps.db.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    thumbnailBlob: null,
                }),
            )
        })

        test('S3 키는 users/{userId}/{uuid}/{filename} 패턴이다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const file = new File([new ArrayBuffer(1024)], 'my-file.txt', { type: 'text/plain' })
            await service.upload(file, 'user-1')

            const callArgs = (deps.storage.upload as ReturnType<typeof mock>).mock.calls[0]
            expect(callArgs[0]).toBe('users/user-1/test-uuid/my-file.txt')
            expect(Buffer.isBuffer(callArgs[1])).toBe(true)
            expect(callArgs[2]).toStartWith('text/plain')
        })
    })

    describe('list', () => {
        test('페이지네이션된 목록을 반환한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const result = await service.list('user-1', { page: 1, limit: 20, sort: 'created', order: 'desc' })

            expect(result.data).toHaveLength(1)
            expect(result.total).toBe(1)
            expect(result.page).toBe(1)
            expect(result.limit).toBe(20)
        })

        test('썸네일을 base64 data URL로 변환한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const result = await service.list('user-1', { page: 1, limit: 20, sort: 'created', order: 'desc' })

            expect(result.data[0].thumbnail).toStartWith('data:image/webp;base64,')
        })

        test('offset을 올바르게 계산한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            await service.list('user-1', { page: 3, limit: 10, sort: 'created', order: 'desc' })

            expect(deps.db.list).toHaveBeenCalledWith(
                expect.objectContaining({
                    offset: 20,
                    limit: 10,
                }),
            )
        })
    })

    describe('getDetail', () => {
        test('비공개 파일은 presigned URL을 반환한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const result = await service.getDetail(1, 'user-1')

            expect(result.url).toBe('https://presigned.example.com/file?token=abc')
            expect(deps.storage.getPresignedUrl).toHaveBeenCalledWith('users/user-1/uuid/photo.jpg', 300)
        })

        test('공개 파일은 CDN URL을 반환한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() =>
                Promise.resolve({
                    id: 1,
                    userId: 'user-1',
                    s3Key: 'users/user-1/uuid/photo.jpg',
                    originalName: 'photo.jpg',
                    mimeType: 'image/jpeg',
                    sizeBytes: 5000,
                    fileHash: 'abc123',
                    folderId: null,
                    thumbnailBlob: null,
                    isPublic: true,
                    uploadStatus: 'ready',
                    uploadToken: null,
                    localPath: null,
                    gdriveFileId: null,
                    storageTiers: 'L1',
                    accessCount: 0,
                    lastViewedAt: null,
                    createdAt: now,
                    updatedAt: now,
                }),
            )
            const service = createDriveAssetService(deps)

            const result = await service.getDetail(1, 'user-1')

            expect(result.url).toBe('https://cdn.example.com/users/user-1/uuid/photo.jpg')
            expect(deps.storage.getPresignedUrl).not.toHaveBeenCalled()
        })

        test('존재하지 않는 파일에 대해 에러를 throw한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(null))
            const service = createDriveAssetService(deps)

            await expect(service.getDetail(999, 'user-1')).rejects.toMatchObject({ code: 'DRIVE_ASSET_NOT_FOUND' })
        })

        test('다른 유저의 파일 접근 시 에러를 throw한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            await expect(service.getDetail(1, 'other-user')).rejects.toMatchObject({ code: 'DRIVE_ASSET_NOT_FOUND' })
        })

        test('lastViewedAt을 갱신한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            await service.getDetail(1, 'user-1')

            expect(deps.db.update).toHaveBeenCalledWith(1, expect.objectContaining({ lastViewedAt: expect.any(Date) }))
        })
    })

    describe('update', () => {
        test('공개 설정을 변경한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const result = await service.update(1, 'user-1', { isPublic: true })

            expect(result.isPublic).toBe(true)
            expect(deps.db.update).toHaveBeenCalledWith(1, { isPublic: true })
        })

        test('존재하지 않는 파일에 대해 에러를 throw한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(null))
            const service = createDriveAssetService(deps)

            await expect(service.update(999, 'user-1', { isPublic: true })).rejects.toMatchObject({ code: 'DRIVE_ASSET_NOT_FOUND' })
        })

        test('다른 유저의 파일 변경 시 에러를 throw한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            await expect(service.update(1, 'other-user', { isPublic: true })).rejects.toMatchObject({ code: 'DRIVE_ASSET_NOT_FOUND' })
        })
    })

    describe('remove', () => {
        test('R2와 DB에서 모두 삭제한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const result = await service.remove(1, 'user-1')

            expect(result.id).toBe(1)
            expect(deps.storage.del).toHaveBeenCalledWith('users/user-1/uuid/photo.jpg')
            expect(deps.db.remove).toHaveBeenCalledWith(1)
        })

        test('존재하지 않는 파일에 대해 에러를 throw한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(null))
            const service = createDriveAssetService(deps)

            await expect(service.remove(999, 'user-1')).rejects.toMatchObject({ code: 'DRIVE_ASSET_NOT_FOUND' })
        })

        test('다른 유저의 파일 삭제 시 에러를 throw한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            await expect(service.remove(1, 'other-user')).rejects.toMatchObject({ code: 'DRIVE_ASSET_NOT_FOUND' })
        })
    })

    describe('getQuota', () => {
        test('사용량과 한도를 반환한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const result = await service.getQuota('user-1')

            expect(result.used).toBe(1000)
            expect(result.total).toBe(10 * 1024 * 1024)
            expect(result.remaining).toBe(10 * 1024 * 1024 - 1000)
        })
    })

    describe('보안: Path Traversal 방어', () => {
        test('경로 조작 문자가 포함된 파일명을 sanitize한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const file = new File([new ArrayBuffer(1024)], '../../etc/passwd', { type: 'text/plain' })
            await service.upload(file, 'user-1')

            const callArgs = (deps.storage.upload as ReturnType<typeof mock>).mock.calls[0]
            expect(callArgs[0]).not.toContain('..')
            expect(callArgs[0]).toStartWith('users/user-1/test-uuid/')
        })

        test('역슬래시 경로를 sanitize한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const file = new File([new ArrayBuffer(1024)], '..\\..\\admin\\secret.txt', { type: 'text/plain' })
            await service.upload(file, 'user-1')

            const callArgs = (deps.storage.upload as ReturnType<typeof mock>).mock.calls[0]
            expect(callArgs[0]).not.toContain('..')
            expect(callArgs[0]).not.toContain('\\')
        })

        test('슬래시가 포함된 파일명에서 basename만 사용한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const file = new File([new ArrayBuffer(1024)], 'path/to/file.txt', { type: 'text/plain' })
            await service.upload(file, 'user-1')

            const callArgs = (deps.storage.upload as ReturnType<typeof mock>).mock.calls[0]
            expect(callArgs[0]).toBe('users/user-1/test-uuid/file.txt')
        })
    })

    describe('보안: MIME 타입 검증', () => {
        test('블랙리스트 MIME 타입을 거부한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const file = new File([new ArrayBuffer(1024)], 'malware.exe', { type: 'application/x-msdownload' })
            await expect(service.upload(file, 'user-1')).rejects.toMatchObject({ code: 'DRIVE_INVALID_MIME_TYPE' })
        })

        test('블랙리스트 확장자를 거부한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const file = new File([new ArrayBuffer(1024)], 'script.bat', { type: 'application/octet-stream' })
            await expect(service.upload(file, 'user-1')).rejects.toMatchObject({ code: 'DRIVE_INVALID_MIME_TYPE' })
        })

        test('잘못된 MIME 형식을 거부한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const file = new File([new ArrayBuffer(1024)], 'file.txt', { type: 'invalid-mime' })
            await expect(service.upload(file, 'user-1')).rejects.toMatchObject({ code: 'DRIVE_INVALID_MIME_TYPE' })
        })

        test('image/jpeg MIME인데 magic byte가 다르면 거부한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const file = new File([new Uint8Array([0x00, 0x00, 0x00, 0x00])], 'fake.jpg', { type: 'image/jpeg' })
            await expect(service.upload(file, 'user-1')).rejects.toMatchObject({ code: 'DRIVE_INVALID_MIME_TYPE' })
        })

        test('image/png MIME인데 magic byte가 다르면 거부한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'fake.png', { type: 'image/png' })
            await expect(service.upload(file, 'user-1')).rejects.toMatchObject({ code: 'DRIVE_INVALID_MIME_TYPE' })
        })

        test('유효한 magic byte를 가진 이미지는 통과한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(1020).fill(0)])
            const file = new File([jpegBytes], 'valid.jpg', { type: 'image/jpeg' })
            const result = await service.upload(file, 'user-1')
            expect(result.id).toBe(1)
        })

        test('text/html MIME을 거부한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const file = new File(['<html></html>'], 'page.html', { type: 'text/html' })
            await expect(service.upload(file, 'user-1')).rejects.toMatchObject({ code: 'DRIVE_INVALID_MIME_TYPE' })
        })

        test('.ps1 확장자를 거부한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const file = new File(['Get-Process'], 'script.ps1', { type: 'application/octet-stream' })
            await expect(service.upload(file, 'user-1')).rejects.toMatchObject({ code: 'DRIVE_INVALID_MIME_TYPE' })
        })
    })

    describe('보안: originalName 업데이트 검증', () => {
        test('경로 문자가 포함된 이름을 sanitize한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            await service.update(1, 'user-1', { originalName: '../../etc/passwd' })

            expect(deps.db.update).toHaveBeenCalledWith(1, expect.objectContaining({ originalName: expect.not.stringContaining('..') }))
        })

        test('빈 이름은 file로 대체한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            await service.update(1, 'user-1', { originalName: '   ' })

            expect(deps.db.update).toHaveBeenCalledWith(1, expect.objectContaining({ originalName: 'file' }))
        })
    })

    describe('무결성: 업로드 실패 시 S3 롤백', () => {
        test('DB insert 실패 시 S3 파일을 삭제한다', async () => {
            const deps = createMockDeps()
            deps.db.insert = mock(() => Promise.reject(new Error('DB error')))
            const service = createDriveAssetService(deps)

            const file = new File([new ArrayBuffer(1024)], 'file.txt', { type: 'text/plain' })
            await expect(service.upload(file, 'user-1')).rejects.toThrow('DB error')

            expect(deps.storage.upload).toHaveBeenCalled()
            expect(deps.storage.del).toHaveBeenCalled()
        })

        test('DB insert 실패 + S3 롤백 실패해도 원래 에러를 throw한다', async () => {
            const deps = createMockDeps()
            deps.db.insert = mock(() => Promise.reject(new Error('DB error')))
            deps.storage.del = mock(() => Promise.reject(new Error('S3 delete error')))
            const service = createDriveAssetService(deps)

            const file = new File([new ArrayBuffer(1024)], 'file.txt', { type: 'text/plain' })
            await expect(service.upload(file, 'user-1')).rejects.toThrow('DB error')
        })
    })

    describe('무결성: 삭제 순서', () => {
        test('DB를 먼저 삭제하고 S3를 삭제한다', async () => {
            const deps = createMockDeps()
            const callOrder: string[] = []
            deps.db.remove = mock(() => {
                callOrder.push('db')
                return Promise.resolve()
            })
            deps.storage.del = mock(() => {
                callOrder.push('s3')
                return Promise.resolve()
            })
            const service = createDriveAssetService(deps)

            await service.remove(1, 'user-1')

            expect(callOrder).toEqual(['db', 's3'])
        })

        test('S3 삭제 실패해도 DB 삭제는 유지된다', async () => {
            const deps = createMockDeps()
            deps.storage.del = mock(() => Promise.reject(new Error('S3 error')))
            const service = createDriveAssetService(deps)

            const result = await service.remove(1, 'user-1')

            expect(result.id).toBe(1)
            expect(deps.db.remove).toHaveBeenCalledWith(1)
        })
    })

    describe('prepare', () => {
        test('메타데이터만 DB에 저장하고 preparing 상태로 반환한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            const result = await service.prepare('user-1', {
                originalName: 'video.mp4',
                mimeType: 'video/mp4',
                sizeBytes: 500_000,
                folderId: null,
            })

            expect(result.assetId).toBe(1)
            expect(result.s3Key).toContain('users/user-1/')
            expect(result.s3Key).toContain('video.mp4')
            expect(result.uploadToken).toHaveLength(64)
            expect(result.uploadStatus).toBe('preparing')
            expect(deps.db.insert).toHaveBeenCalledTimes(1)
            const insertArg = (deps.db.insert as ReturnType<typeof mock>).mock.calls[0][0] as Record<string, unknown>
            expect(insertArg.uploadStatus).toBe('preparing')
            expect(insertArg.storageTiers).toBe('')
            expect(insertArg.fileHash).toBe('')
        })

        test('쿼터 초과 시 DRIVE_QUOTA_EXCEEDED 에러를 던진다', async () => {
            const deps = createMockDeps()
            deps.getUserQuotaBytes = mock(() => Promise.resolve(1000))
            deps.db.getTotalSizeByUser = mock(() => Promise.resolve(900))
            const service = createDriveAssetService(deps)

            await expect(
                service.prepare('user-1', { originalName: 'big.zip', mimeType: 'application/zip', sizeBytes: 200, folderId: null }),
            ).rejects.toMatchObject({ code: 'DRIVE_QUOTA_EXCEEDED' })
        })

        test('차단된 MIME 타입은 DRIVE_INVALID_MIME_TYPE 에러를 던진다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            await expect(
                service.prepare('user-1', { originalName: 'hack.exe', mimeType: 'application/x-msdownload', sizeBytes: 100, folderId: null }),
            ).rejects.toMatchObject({ code: 'DRIVE_INVALID_MIME_TYPE' })
        })
    })

    describe('complete', () => {
        test('업로드 토큰이 일치하면 ready 상태로 업데이트한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() =>
                Promise.resolve({
                    id: 1,
                    userId: 'user-1',
                    s3Key: 'users/user-1/uuid/video.mp4',
                    originalName: 'video.mp4',
                    mimeType: 'video/mp4',
                    sizeBytes: 500_000,
                    fileHash: '',
                    folderId: null,
                    thumbnailBlob: null,
                    isPublic: false,
                    uploadStatus: 'preparing',
                    uploadToken: 'valid-token',
                    localPath: null,
                    gdriveFileId: null,
                    storageTiers: '',
                    accessCount: 0,
                    lastViewedAt: null,
                    createdAt: now,
                    updatedAt: now,
                }),
            )
            const service = createDriveAssetService(deps)

            const result = await service.complete(1, 'valid-token', {
                fileHash: 'abc123',
                storageTiers: 'L1,L3',
                gdriveFileId: 'gdrive-file-123',
                localPath: null,
                thumbnailBase64: null,
            })

            expect(result.id).toBe(1)
            expect(result.uploadStatus).toBe('ready')
            expect(deps.db.update).toHaveBeenCalled()
        })

        test('업로드 토큰이 불일치하면 UNAUTHORIZED 에러를 던진다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() =>
                Promise.resolve({
                    id: 1,
                    userId: 'user-1',
                    s3Key: 'users/user-1/uuid/video.mp4',
                    originalName: 'video.mp4',
                    mimeType: 'video/mp4',
                    sizeBytes: 500_000,
                    fileHash: '',
                    folderId: null,
                    thumbnailBlob: null,
                    isPublic: false,
                    uploadStatus: 'preparing',
                    uploadToken: 'valid-token',
                    localPath: null,
                    gdriveFileId: null,
                    storageTiers: '',
                    accessCount: 0,
                    lastViewedAt: null,
                    createdAt: now,
                    updatedAt: now,
                }),
            )
            const service = createDriveAssetService(deps)

            await expect(
                service.complete(1, 'wrong-token', { fileHash: 'abc', storageTiers: 'L1', gdriveFileId: null, localPath: null, thumbnailBase64: null }),
            ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
        })

        test('이미 ready 상태인 asset은 DRIVE_UPLOAD_EVENT_FAILED 에러를 던진다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() =>
                Promise.resolve({
                    id: 1,
                    userId: 'user-1',
                    s3Key: 'users/user-1/uuid/video.mp4',
                    originalName: 'video.mp4',
                    mimeType: 'video/mp4',
                    sizeBytes: 500_000,
                    fileHash: 'abc123',
                    folderId: null,
                    thumbnailBlob: null,
                    isPublic: false,
                    uploadStatus: 'ready',
                    uploadToken: 'token',
                    localPath: null,
                    gdriveFileId: null,
                    storageTiers: 'L1',
                    accessCount: 0,
                    lastViewedAt: null,
                    createdAt: now,
                    updatedAt: now,
                }),
            )
            const service = createDriveAssetService(deps)

            await expect(
                service.complete(1, 'token', { fileHash: 'abc', storageTiers: 'L1', gdriveFileId: null, localPath: null, thumbnailBase64: null }),
            ).rejects.toMatchObject({ code: 'DRIVE_UPLOAD_EVENT_FAILED' })
        })

        test('storageTiers가 비어있으면 failed 상태로 설정한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() =>
                Promise.resolve({
                    id: 1,
                    userId: 'user-1',
                    s3Key: 'users/user-1/uuid/video.mp4',
                    originalName: 'video.mp4',
                    mimeType: 'video/mp4',
                    sizeBytes: 500_000,
                    fileHash: '',
                    folderId: null,
                    thumbnailBlob: null,
                    isPublic: false,
                    uploadStatus: 'preparing',
                    uploadToken: 'valid-token',
                    localPath: null,
                    gdriveFileId: null,
                    storageTiers: '',
                    accessCount: 0,
                    lastViewedAt: null,
                    createdAt: now,
                    updatedAt: now,
                }),
            )
            const service = createDriveAssetService(deps)

            const result = await service.complete(1, 'valid-token', {
                fileHash: 'abc',
                storageTiers: '',
                gdriveFileId: null,
                localPath: null,
                thumbnailBase64: null,
            })

            expect(result.uploadStatus).toBe('failed')
        })
    })
})
