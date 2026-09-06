import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { createDriveAssetService } from '../../../../service/domain/drive/drive-asset'

const now = new Date()

const mockAssetRow = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    userId: 'user-1',
    s3Key: 'users/user-1/uuid/photo.jpg',
    originalName: 'photo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 5000,
    fileHash: 'abc123',
    folderId: null as string | null,
    thumbnailBlob: Buffer.from('thumb') as Buffer | null,
    isPublic: false,
    uploadStatus: 'ready',
    uploadToken: null as string | null,
    localPath: null as string | null,
    gdriveFileId: null as string | null,
    storageTiers: 'L1',
    accessCount: 0,
    lastViewedAt: null as Date | null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
})

const createMockDeps = () => ({
    storage: {
        upload: mock(() => Promise.resolve({ key: 'users/user-1/uuid/photo.jpg', url: 'https://cdn.example.com/users/user-1/uuid/photo.jpg' })),
        del: mock(() => Promise.resolve()),
        getUrl: (key: string) => `https://cdn.example.com/${key}`,
        getPresignedUrl: mock(() => Promise.resolve('https://presigned.example.com/file?token=abc')),
        getObjectStream: mock(() => Promise.resolve(null as ReadableStream | null)),
    },
    getGdriveStorage: mock(() => Promise.resolve(null as { download: () => Promise<ReadableStream>; del: () => Promise<void> } | null)),
    imageProcessor: {
        resize: mock(() => Promise.resolve(Buffer.from('resized'))),
        toWebp: mock(() => Promise.resolve(Buffer.from('thumbnail-webp'))),
    },
    folderDb: {
        getById: mock(() => Promise.resolve({ id: 'folder-1', userId: 'user-1' } as { id: string; userId: string } | null)),
    },
    db: {
        insert: mock(() => Promise.resolve({ id: 1 } as { id: number } | null)),
        getById: mock(() => Promise.resolve(mockAssetRow() as ReturnType<typeof mockAssetRow> | null)),
        getByUserAndHash: mock(() => Promise.resolve(null as ReturnType<typeof mockAssetRow> | null)),
        list: mock(() => Promise.resolve({ data: [mockAssetRow()], total: 1 })),
        update: mock(() => Promise.resolve({ id: 1 } as { id: number } | null)),
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
                Promise.resolve(
                    mockAssetRow({ s3Key: 'existing', originalName: 'existing.jpg', sizeBytes: 1024, fileHash: 'abc', thumbnailBlob: null }),
                ),
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
            deps.db.getById = mock(() => Promise.resolve(mockAssetRow({ isPublic: true, thumbnailBlob: null })))
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
                fileHash: 'abc123hash',
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
            expect(insertArg.fileHash).toBe('abc123hash')
        })

        test('동일 해시 파일이 존재하면 업로드 전에 중복 에러를 던진다', async () => {
            const deps = createMockDeps()
            deps.db.getByUserAndHash = mock(() => Promise.resolve(mockAssetRow() as ReturnType<typeof mockAssetRow> | null))
            const service = createDriveAssetService(deps)

            await expect(
                service.prepare('user-1', {
                    originalName: 'dup.mp4',
                    mimeType: 'video/mp4',
                    sizeBytes: 500_000,
                    folderId: null,
                    fileHash: 'existing-hash',
                }),
            ).rejects.toMatchObject({ code: 'DRIVE_DUPLICATE_FILE' })
            expect(deps.db.insert).not.toHaveBeenCalled()
        })

        test('fileHash 없으면 pending_ 접두사로 저장한다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            await service.prepare('user-1', { originalName: 'video.mp4', mimeType: 'video/mp4', sizeBytes: 500_000, folderId: null, fileHash: '' })

            const insertArg = (deps.db.insert as ReturnType<typeof mock>).mock.calls[0][0] as Record<string, unknown>
            expect(insertArg.fileHash).toStartWith('pending_')
        })

        test('쿼터 초과 시 DRIVE_QUOTA_EXCEEDED 에러를 던진다', async () => {
            const deps = createMockDeps()
            deps.getUserQuotaBytes = mock(() => Promise.resolve(1000))
            deps.db.getTotalSizeByUser = mock(() => Promise.resolve(900))
            const service = createDriveAssetService(deps)

            await expect(
                service.prepare('user-1', {
                    originalName: 'big.zip',
                    mimeType: 'application/zip',
                    sizeBytes: 200,
                    folderId: null,
                    fileHash: 'hash1',
                }),
            ).rejects.toMatchObject({ code: 'DRIVE_QUOTA_EXCEEDED' })
        })

        test('차단된 MIME 타입은 DRIVE_INVALID_MIME_TYPE 에러를 던진다', async () => {
            const deps = createMockDeps()
            const service = createDriveAssetService(deps)

            await expect(
                service.prepare('user-1', {
                    originalName: 'hack.exe',
                    mimeType: 'application/x-msdownload',
                    sizeBytes: 100,
                    folderId: null,
                    fileHash: 'hash2',
                }),
            ).rejects.toMatchObject({ code: 'DRIVE_INVALID_MIME_TYPE' })
        })
    })

    describe('complete', () => {
        test('업로드 토큰이 일치하면 ready 상태로 업데이트한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() =>
                Promise.resolve(
                    mockAssetRow({ fileHash: '', uploadStatus: 'preparing', uploadToken: 'valid-token', storageTiers: '', thumbnailBlob: null }),
                ),
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
                Promise.resolve(
                    mockAssetRow({ fileHash: '', uploadStatus: 'preparing', uploadToken: 'valid-token', storageTiers: '', thumbnailBlob: null }),
                ),
            )
            const service = createDriveAssetService(deps)

            await expect(
                service.complete(1, 'wrong-token', {
                    fileHash: 'abc',
                    storageTiers: 'L1',
                    gdriveFileId: null,
                    localPath: null,
                    thumbnailBase64: null,
                }),
            ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
        })

        test('이미 ready 상태인 asset은 DRIVE_UPLOAD_EVENT_FAILED 에러를 던진다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(mockAssetRow({ uploadStatus: 'ready', uploadToken: 'token', thumbnailBlob: null })))
            const service = createDriveAssetService(deps)

            await expect(
                service.complete(1, 'token', { fileHash: 'abc', storageTiers: 'L1', gdriveFileId: null, localPath: null, thumbnailBase64: null }),
            ).rejects.toMatchObject({ code: 'DRIVE_UPLOAD_EVENT_FAILED' })
        })

        test('storageTiers가 비어있으면 failed 상태로 설정한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() =>
                Promise.resolve(
                    mockAssetRow({ fileHash: '', uploadStatus: 'preparing', uploadToken: 'valid-token', storageTiers: '', thumbnailBlob: null }),
                ),
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

    describe('complete: 실제 크기 재검증', () => {
        const preparingRow = () =>
            mockAssetRow({
                fileHash: '',
                uploadStatus: 'preparing',
                uploadToken: 'valid-token',
                storageTiers: '',
                thumbnailBlob: null,
                sizeBytes: 100,
            })

        test('신고 크기와 실제 크기가 다르면 실제 크기로 갱신한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(preparingRow()))
            const service = createDriveAssetService(deps)

            await service.complete(1, 'valid-token', {
                fileHash: 'abc',
                storageTiers: 'L1',
                gdriveFileId: null,
                localPath: null,
                thumbnailBase64: null,
                sizeBytes: 5000,
            })

            expect(deps.db.update).toHaveBeenCalledWith(1, expect.objectContaining({ sizeBytes: 5000, uploadStatus: 'ready' }))
        })

        test('신고 크기와 실제 크기가 같으면 sizeBytes 를 갱신하지 않는다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(preparingRow()))
            const service = createDriveAssetService(deps)

            await service.complete(1, 'valid-token', {
                fileHash: 'abc',
                storageTiers: 'L1',
                gdriveFileId: null,
                localPath: null,
                thumbnailBase64: null,
                sizeBytes: 100,
            })

            const updateArg = (deps.db.update as ReturnType<typeof mock>).mock.calls[0][1] as Record<string, unknown>
            expect(updateArg.sizeBytes).toBeUndefined()
        })

        test('sizeBytes 가 없으면 기존 동작대로 크기를 건드리지 않는다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(preparingRow()))
            const service = createDriveAssetService(deps)

            await service.complete(1, 'valid-token', {
                fileHash: 'abc',
                storageTiers: 'L1',
                gdriveFileId: null,
                localPath: null,
                thumbnailBase64: null,
            })

            const updateArg = (deps.db.update as ReturnType<typeof mock>).mock.calls[0][1] as Record<string, unknown>
            expect(updateArg.sizeBytes).toBeUndefined()
            expect(deps.getUserQuotaBytes).not.toHaveBeenCalled()
        })

        test('실제 크기가 쿼터를 넘기면 failed 로 두고 실물을 정리한 뒤 DRIVE_QUOTA_EXCEEDED 를 던진다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(preparingRow()))
            deps.getUserQuotaBytes = mock(() => Promise.resolve(1000))
            deps.db.getTotalSizeByUser = mock(() => Promise.resolve(900))
            const gdriveDel = mock(() => Promise.resolve())
            deps.getGdriveStorage = mock(() => Promise.resolve({ download: () => Promise.resolve(new ReadableStream()), del: gdriveDel } as never))
            const service = createDriveAssetService(deps)

            await expect(
                service.complete(1, 'valid-token', {
                    fileHash: 'abc',
                    storageTiers: 'L1,L3',
                    gdriveFileId: 'gd-1',
                    localPath: null,
                    thumbnailBase64: null,
                    sizeBytes: 900_000,
                }),
            ).rejects.toMatchObject({ code: 'DRIVE_QUOTA_EXCEEDED' })

            expect(deps.db.update).toHaveBeenCalledWith(1, expect.objectContaining({ uploadStatus: 'failed', storageTiers: '' }))
            expect(deps.storage.del).toHaveBeenCalledWith('users/user-1/uuid/photo.jpg')
            expect(gdriveDel).toHaveBeenCalledWith('gd-1')
        })
    })

    describe('중복 fileHash: 409 처리', () => {
        test('prepare 에서 유니크 위반으로 insert 가 null 이면 DRIVE_DUPLICATE_FILE 을 던진다', async () => {
            const deps = createMockDeps()
            deps.db.insert = mock(() => Promise.resolve(null as { id: number } | null))
            const service = createDriveAssetService(deps)

            await expect(
                service.prepare('user-1', { originalName: 'a.txt', mimeType: 'text/plain', sizeBytes: 10, folderId: null, fileHash: 'dup' }),
            ).rejects.toMatchObject({ code: 'DRIVE_DUPLICATE_FILE', statusCode: 409 })
        })

        test('upload 에서 insert 가 null 이면 R2 오브젝트를 지우고 DRIVE_DUPLICATE_FILE 을 던진다', async () => {
            const deps = createMockDeps()
            deps.db.insert = mock(() => Promise.resolve(null as { id: number } | null))
            const service = createDriveAssetService(deps)

            const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(1020).fill(0)])], 'photo.jpg', { type: 'image/jpeg' })

            await expect(service.upload(file, 'user-1')).rejects.toMatchObject({ code: 'DRIVE_DUPLICATE_FILE', statusCode: 409 })
            expect(deps.storage.del).toHaveBeenCalledWith('users/user-1/test-uuid/photo.jpg')
        })

        test('complete 에서 update 가 null 이면 failed 로 두고 실물을 정리한 뒤 DRIVE_DUPLICATE_FILE 을 던진다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() =>
                Promise.resolve(
                    mockAssetRow({ fileHash: '', uploadStatus: 'uploading', uploadToken: 'valid-token', storageTiers: '', thumbnailBlob: null }),
                ),
            )
            deps.db.update = mock(() => Promise.resolve(null as { id: number } | null))
            const service = createDriveAssetService(deps)

            await expect(
                service.complete(1, 'valid-token', {
                    fileHash: 'dup-hash',
                    storageTiers: 'L1',
                    gdriveFileId: null,
                    localPath: null,
                    thumbnailBase64: null,
                }),
            ).rejects.toMatchObject({ code: 'DRIVE_DUPLICATE_FILE', statusCode: 409 })

            expect(deps.db.update).toHaveBeenLastCalledWith(1, { uploadStatus: 'failed', uploadToken: null, storageTiers: '' })
            expect(deps.storage.del).toHaveBeenCalledWith('users/user-1/uuid/photo.jpg')
        })
    })

    describe('download', () => {
        test('L3 사본이 있으면 Google Drive 스트림을 반환한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(mockAssetRow({ storageTiers: 'L3', gdriveFileId: 'gd-1' })))
            const gdriveStream = new ReadableStream()
            deps.getGdriveStorage = mock(() =>
                Promise.resolve({ download: () => Promise.resolve(gdriveStream), del: () => Promise.resolve() } as never),
            )
            const service = createDriveAssetService(deps)

            const result = await service.download(1, 'user-1')

            expect(result.stream).toBe(gdriveStream)
            expect(deps.storage.getObjectStream).not.toHaveBeenCalled()
        })

        test('L1 만 있는 자산은 R2 스트림으로 응답한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(mockAssetRow({ storageTiers: 'L1', gdriveFileId: null, sizeBytes: 5000 })))
            const r2Stream = new ReadableStream()
            deps.storage.getObjectStream = mock(() => Promise.resolve(r2Stream as ReadableStream | null))
            const service = createDriveAssetService(deps)

            const result = await service.download(1, 'user-1')

            expect(result).toEqual({ stream: r2Stream, mimeType: 'image/jpeg', originalName: 'photo.jpg', sizeBytes: 5000 })
            expect(deps.storage.getObjectStream).toHaveBeenCalledWith('users/user-1/uuid/photo.jpg')
        })

        test('L3 다운로드가 실패하면 기존 동작대로 예외를 전파하고 L1 로 폴백하지 않는다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(mockAssetRow({ storageTiers: 'L1,L3', gdriveFileId: 'gd-1' })))
            deps.getGdriveStorage = mock(() =>
                Promise.resolve({ download: () => Promise.reject(new Error('gdrive down')), del: () => Promise.resolve() } as never),
            )
            const service = createDriveAssetService(deps)

            await expect(service.download(1, 'user-1')).rejects.toThrow('gdrive down')
            expect(deps.storage.getObjectStream).not.toHaveBeenCalled()
        })

        test('gdrive 저장소가 구성되지 않았고 L1 사본이 있으면 R2 스트림으로 응답한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(mockAssetRow({ storageTiers: 'L1,L3', gdriveFileId: 'gd-1' })))
            deps.getGdriveStorage = mock(() => Promise.resolve(null))
            const r2Stream = new ReadableStream()
            deps.storage.getObjectStream = mock(() => Promise.resolve(r2Stream as ReadableStream | null))
            const service = createDriveAssetService(deps)

            expect((await service.download(1, 'user-1')).stream).toBe(r2Stream)
        })

        test('L1 오브젝트도 없으면 DRIVE_ALL_TIERS_FAILED 를 던진다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(mockAssetRow({ storageTiers: 'L1', gdriveFileId: null })))
            const service = createDriveAssetService(deps)

            await expect(service.download(1, 'user-1')).rejects.toMatchObject({ code: 'DRIVE_ALL_TIERS_FAILED' })
        })

        test('다른 사용자의 자산은 DRIVE_ASSET_NOT_FOUND 를 던진다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(mockAssetRow({ storageTiers: 'L1' })))
            const service = createDriveAssetService(deps)

            await expect(service.download(1, 'user-2')).rejects.toMatchObject({ code: 'DRIVE_ASSET_NOT_FOUND' })
        })
    })

    describe('updateUploadStatus', () => {
        test('업로드 토큰이 일치하면 uploading 상태로 갱신한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(mockAssetRow({ uploadStatus: 'preparing', uploadToken: 'valid-token' })))
            const service = createDriveAssetService(deps)

            const result = await service.updateUploadStatus(1, 'valid-token', 'uploading')

            expect(deps.db.update).toHaveBeenCalledWith(1, { uploadStatus: 'uploading' })
            expect(result).toEqual({ id: 1, uploadStatus: 'uploading', s3Key: 'users/user-1/uuid/photo.jpg' })
        })

        test('업로드 토큰 길이가 다르면 UNAUTHORIZED 에러를 던진다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(mockAssetRow({ uploadStatus: 'preparing', uploadToken: 'valid-token' })))
            const service = createDriveAssetService(deps)

            await expect(service.updateUploadStatus(1, 'valid', 'uploading')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
            expect(deps.db.update).not.toHaveBeenCalled()
        })

        test('저장된 업로드 토큰이 null 이면 빈 토큰으로도 통과하지 못한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(mockAssetRow({ uploadStatus: 'preparing', uploadToken: null })))
            const service = createDriveAssetService(deps)

            await expect(service.updateUploadStatus(1, '', 'uploading')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
        })
    })

    describe('getAssetForTokenExchange', () => {
        test('토큰이 일치하고 preparing 상태면 asset 을 반환한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(mockAssetRow({ uploadStatus: 'preparing', uploadToken: 'valid-token' })))
            const service = createDriveAssetService(deps)

            expect(await service.getAssetForTokenExchange(1, 'valid-token')).toEqual({ id: 1, userId: 'user-1' })
        })

        test('토큰이 불일치하면 null 을 반환한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(mockAssetRow({ uploadStatus: 'preparing', uploadToken: 'valid-token' })))
            const service = createDriveAssetService(deps)

            expect(await service.getAssetForTokenExchange(1, 'wrong-token')).toBeNull()
        })

        test('저장된 토큰이 null 이면 null 을 반환한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(mockAssetRow({ uploadStatus: 'preparing', uploadToken: null })))
            const service = createDriveAssetService(deps)

            expect(await service.getAssetForTokenExchange(1, '')).toBeNull()
        })
    })
})
